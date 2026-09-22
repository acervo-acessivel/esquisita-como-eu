/* ==========================================================================
   Esquisita como eu — interações (etapa 4)

   JS puro, sem dependências. A página funciona sem este arquivo: o conteúdo
   está todo no HTML, os itens de acessibilidade ficam abertos e cada áudio
   tem o player nativo. Ao carregar, este script marca <html class="js"> e o
   CSS troca esses fallbacks pelos controles do desenho.

   1. Navegação por âncoras   2. Player de áudio   3. Acordeão   4. Zoom
   A rolagem suave e as transições ficam no CSS, dentro de
   prefers-reduced-motion. Nada aqui anima.
   ========================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  /* ------------------------------------------------------------------------
     1. Navegação por âncoras
     - Ao ir para uma dobra, o foco vai para o heading dela (tabindex="-1").
     - O item da navbar da dobra visível recebe aria-current="location".
     ---------------------------------------------------------------------- */
  function initNav() {
    var items = [];

    each(document.querySelectorAll('.navbar__list a[href^="#"]'), function (link) {
      var section = document.getElementById(link.getAttribute('href').slice(1));
      if (!section) return;
      items.push({ link: link, section: section, heading: section.querySelector('h1, h2') });
    });
    if (!items.length) return;

    function byHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      return items.filter(function (i) { return i.section.id === id; })[0];
    }

    function setCurrent(item) {
      items.forEach(function (i) {
        if (i === item) i.link.setAttribute('aria-current', 'location');
        else i.link.removeAttribute('aria-current');
      });
    }

    // preventScroll: a rolagem (suave ou não) é do navegador
    function focusHeading(item) {
      if (item && item.heading) item.heading.focus({ preventScroll: true });
    }

    // Enquanto a rolagem suave passa por outras dobras, o observador espera
    var locked = false;
    var lockTimer;
    function lock() {
      locked = true;
      clearTimeout(lockTimer);
      function unlock() {
        locked = false;
        window.removeEventListener('scrollend', unlock);
      }
      if ('onscrollend' in window) window.addEventListener('scrollend', unlock);
      lockTimer = setTimeout(unlock, 1000);
    }

    items.forEach(function (item) {
      item.link.addEventListener('click', function (e) {
        if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        setCurrent(item);
        lock();
        focusHeading(item);
      });
    });

    // Voltar/avançar e mudança manual do hash
    window.addEventListener('hashchange', function () {
      var item = byHash();
      if (!item) return;
      setCurrent(item);
      focusHeading(item);
    });

    // Dobra visível: faixa fina no meio da janela
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        if (locked) return;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          items.forEach(function (i) {
            if (i.section === entry.target) setCurrent(i);
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      items.forEach(function (i) { observer.observe(i.section); });
    }

    // Página aberta com #hash. Depois do load o navegador ainda tira o foco
    // ao ir para o fragmento, então o heading é focado de novo nesse momento.
    var initial = byHash();
    if (initial) {
      setCurrent(initial);
      focusHeading(initial);
      window.addEventListener('load', function () {
        var again = byHash();
        if (again && document.activeElement === document.body) focusHeading(again);
      });
    }
  }

  /* ------------------------------------------------------------------------
     2. Player de áudio
     Um componente só: cada <div class="audio-player"> com um <audio> ganha o
     player montado aqui (o HTML tem só o <audio>, com controls para quando
     não há JS). O visual replica o player nativo do Chrome (--player-*).
     Só um áudio toca por vez, e a velocidade vale para todos.
     ---------------------------------------------------------------------- */
  var PATHS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    volumeOn: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    volumeOff: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'
  };
  var RATES = [0.5, 0.75, 1, 1.25, 1.5];
  var SEEK_STEP = 5; // segundos por seta
  var players = [];
  var currentRate = 1;
  var openMenuOwner = null;
  var uid = 0;

  function svg(path, hidden) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (hidden ? ' hidden' : '') +
      '><path d="' + path + '"/></svg>';
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var t = Math.floor(seconds);
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // "1 minuto e 20 segundos", "3 minutos", "20 segundos"
  function spoken(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var t = Math.floor(seconds);
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    var parts = [];
    if (h) parts.push(plural(h, 'hora', 'horas'));
    if (m) parts.push(plural(m, 'minuto', 'minutos'));
    if (s || !parts.length) parts.push(plural(s, 'segundo', 'segundos'));
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0];
  }

  function rateLabel(rate) {
    return rate === 1 ? 'Normal' : String(rate);
  }

  function rateText(rate) {
    return String(rate) + 'x';
  }

  function keepPitch(audio) {
    if ('preservesPitch' in audio) audio.preservesPitch = true;
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
  }

  function setupPlayer(root) {
    var audio = root.querySelector('audio');
    if (!audio) return null;

    var n = ++uid;
    var name = root.getAttribute('data-audio-name') || 'áudio';
    if (!audio.id) audio.id = 'audio-' + n;
    var menuId = 'player-menu-' + n;
    audio.removeAttribute('controls');

    var items = RATES.map(function (rate) {
      return '<button type="button" class="player__menu-item" role="menuitemradio" aria-checked="false"' +
        ' tabindex="-1" data-rate="' + rate + '">' + rateLabel(rate) + svg(PATHS.check) + '</button>';
    }).join('');

    root.insertAdjacentHTML('beforeend',
      '<div class="player">' +
        '<button type="button" class="player__btn player__play" aria-pressed="false" aria-controls="' + audio.id + '">' +
          svg(PATHS.play) + svg(PATHS.pause, true) +
        '</button>' +
        '<span class="player__time"><span class="player__current">0:00</span><span class="player__duration">/ 0:00</span></span>' +
        '<input type="range" class="player__seek" aria-label="Progresso do áudio" min="0" max="0" step="any" value="0" disabled>' +
        '<div class="player__volume" role="group" aria-label="Controle de volume">' +
          '<div class="player__volume-slider">' +
            '<input type="range" class="player__volume-range" aria-label="Volume" min="0" max="1" step="0.05" value="1">' +
          '</div>' +
          '<button type="button" class="player__btn player__mute" aria-pressed="false" aria-controls="' + audio.id + '">' +
            svg(PATHS.volumeOn) + svg(PATHS.volumeOff, true) +
          '</button>' +
        '</div>' +
        '<div class="player__speed">' +
          '<button type="button" class="player__speed-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="' + menuId + '">1x</button>' +
          '<div class="player__menu" id="' + menuId + '" role="menu" aria-label="Velocidade de reprodução" hidden>' + items + '</div>' +
        '</div>' +
      '</div>');

    var playBtn = root.querySelector('.player__play');
    var current = root.querySelector('.player__current');
    var duration = root.querySelector('.player__duration');
    var seek = root.querySelector('.player__seek');
    var volRange = root.querySelector('.player__volume-range');
    var muteBtn = root.querySelector('.player__mute');
    var speedRoot = root.querySelector('.player__speed');
    var speedBtn = root.querySelector('.player__speed-btn');
    var menu = root.querySelector('.player__menu');
    var menuItems = [].slice.call(menu.querySelectorAll('.player__menu-item'));
    var scrubbing = false;
    var lastSecond = -1;

    function toggleIcons(button, first) {
      var icons = button.querySelectorAll('svg');
      // svg não tem a propriedade .hidden: usa o atributo
      icons[0].toggleAttribute('hidden', !first);
      icons[1].toggleAttribute('hidden', first);
    }

    function setPercent(el, prop, value, total) {
      var pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
      el.style.setProperty(prop, pct.toFixed(2) + '%');
    }

    function bufferedEnd() {
      var b = audio.buffered;
      var t = audio.currentTime;
      for (var i = 0; i < b.length; i++) {
        if (b.start(i) <= t + 0.5 && t <= b.end(i) + 0.5) return b.end(i);
      }
      return t;
    }

    function updateBuffered() {
      var d = audio.duration;
      if (isFinite(d) && d > 0) setPercent(seek, '--buffered', Math.max(bufferedEnd(), audio.currentTime), d);
    }

    function updateSeek(force) {
      var t = audio.currentTime;
      var d = audio.duration;
      current.textContent = formatTime(t);
      seek.value = t;
      setPercent(seek, '--played', t, d);
      var sec = Math.floor(t);
      if (force || sec !== lastSecond) {
        lastSecond = sec;
        seek.setAttribute('aria-valuetext', spoken(t) + ' de ' + spoken(isFinite(d) ? d : 0));
      }
    }

    function updateDuration() {
      var d = audio.duration;
      var ok = isFinite(d) && d > 0;
      duration.textContent = '/ ' + formatTime(ok ? d : 0);
      seek.max = ok ? d : 0;
      seek.disabled = !ok;
      updateSeek(true);
      updateBuffered();
    }

    function setPlaying(playing) {
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', (playing ? 'Pausar ' : 'Ouvir ') + name);
      toggleIcons(playBtn, !playing); // play parado, pause tocando
    }

    function syncVolume() {
      var muted = audio.muted;
      var v = muted ? 0 : audio.volume;
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.setAttribute('aria-label', muted ? 'Ativar som' : 'Silenciar áudio');
      toggleIcons(muteBtn, !muted); // volume ligado, volume desligado
      volRange.value = v;
      setPercent(volRange, '--played', v, 1);
      volRange.setAttribute('aria-valuetext', Math.round(v * 100) + '%');
    }

    function setRate(rate) {
      currentRate = rate;
      audio.playbackRate = rate;
      keepPitch(audio);
      speedBtn.textContent = rateText(rate);
      speedBtn.setAttribute('aria-label', 'Velocidade: ' + rateText(rate));
      menuItems.forEach(function (item) {
        item.setAttribute('aria-checked', String(parseFloat(item.getAttribute('data-rate')) === rate));
      });
    }

    /* ---- menu de velocidade (padrão menu button) ---- */
    function focusItem(item) {
      menuItems.forEach(function (i) { i.tabIndex = -1; });
      item.tabIndex = 0;
      item.focus();
    }

    function checkedItem() {
      return menuItems.filter(function (i) { return i.getAttribute('aria-checked') === 'true'; })[0] || menuItems[0];
    }

    function openMenu(target) {
      if (openMenuOwner && openMenuOwner !== api) openMenuOwner.closeMenu(false);
      menu.hidden = false;
      speedBtn.setAttribute('aria-expanded', 'true');
      openMenuOwner = api;
      // abre abaixo; se não couber e houver mais espaço em cima, abre acima
      menu.classList.remove('is-above');
      var rect = speedBtn.getBoundingClientRect();
      var need = menu.offsetHeight + 8;
      var below = window.innerHeight - rect.bottom;
      if (below < need && rect.top > below) menu.classList.add('is-above');
      focusItem(target === 'last' ? menuItems[menuItems.length - 1] : checkedItem());
    }

    function closeMenu(returnFocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      speedBtn.setAttribute('aria-expanded', 'false');
      if (openMenuOwner === api) openMenuOwner = null;
      if (returnFocus) speedBtn.focus();
    }

    speedBtn.addEventListener('click', function () {
      if (menu.hidden) openMenu('checked');
      else closeMenu(false);
    });

    speedBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openMenu('checked'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); openMenu('last'); }
      else if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(true); }
    });

    menu.addEventListener('keydown', function (e) {
      var i = menuItems.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(menuItems[(i + 1) % menuItems.length]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(menuItems[(i - 1 + menuItems.length) % menuItems.length]); }
      else if (e.key === 'Home') { e.preventDefault(); focusItem(menuItems[0]); }
      else if (e.key === 'End') { e.preventDefault(); focusItem(menuItems[menuItems.length - 1]); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false); // o foco segue o Tab
    });

    menuItems.forEach(function (item) {
      item.addEventListener('click', function () {
        applyRate(parseFloat(item.getAttribute('data-rate')));
        closeMenu(true);
      });
    });

    /* ---- reprodução ---- */
    playBtn.addEventListener('click', function () {
      if (!audio.paused) {
        audio.pause();
        return;
      }
      var started = audio.play();
      if (started && started.catch) {
        started.catch(function () { setPlaying(false); }); // arquivo ausente ou bloqueado
      }
    });

    /* ---- progresso: clique, arraste e setas (5 s por passo) ---- */
    seek.addEventListener('pointerdown', function () { scrubbing = true; });
    window.addEventListener('pointerup', function () { scrubbing = false; });
    window.addEventListener('pointercancel', function () { scrubbing = false; });

    seek.addEventListener('input', function () {
      audio.currentTime = parseFloat(seek.value);
      updateSeek(true);
      updateBuffered();
    });

    seek.addEventListener('keydown', function (e) {
      var dir = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dir = 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dir = -1;
      if (!dir || !audio.duration) return;
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + dir * SEEK_STEP));
      updateSeek(true);
      updateBuffered();
    });

    /* ---- volume ---- */
    muteBtn.addEventListener('click', function () {
      if (audio.muted) {
        audio.muted = false;
        if (audio.volume === 0) audio.volume = 1;
      } else {
        audio.muted = true;
      }
    });

    volRange.addEventListener('input', function () {
      var v = parseFloat(volRange.value);
      audio.volume = v;
      audio.muted = v === 0;
    });

    /* ---- eventos do <audio> ---- */
    audio.addEventListener('play', function () {
      setPlaying(true);
      players.forEach(function (p) {
        if (p.audio !== audio && !p.audio.paused) p.audio.pause(); // o ícone dele volta pelo evento pause
      });
    });
    audio.addEventListener('pause', function () { setPlaying(false); });
    audio.addEventListener('ended', function () {
      setPlaying(false);
      audio.currentTime = 0;
    });
    audio.addEventListener('error', function () { setPlaying(false); });
    audio.addEventListener('timeupdate', function () {
      if (!scrubbing) updateSeek(false);
      updateBuffered();
    });
    audio.addEventListener('progress', updateBuffered);
    audio.addEventListener('loadedmetadata', function () {
      audio.playbackRate = currentRate; // o navegador zera ao carregar
      keepPitch(audio);
      updateDuration();
    });
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('volumechange', syncVolume);
    audio.addEventListener('ratechange', function () {
      if (audio.playbackRate !== currentRate) audio.playbackRate = currentRate;
    });

    var api = { audio: audio, setRate: setRate, closeMenu: closeMenu, speedRoot: speedRoot };

    setPlaying(false);
    syncVolume();
    setRate(currentRate);
    updateDuration();
    return api;
  }

  function applyRate(rate) {
    players.forEach(function (p) { p.setRate(rate); });
  }

  function initAudio() {
    each(document.querySelectorAll('.audio-player'), function (root) {
      var player = setupPlayer(root);
      if (player) players.push(player);
    });

    // clicar fora fecha o menu de velocidade
    document.addEventListener('pointerdown', function (e) {
      if (openMenuOwner && !openMenuOwner.speedRoot.contains(e.target)) openMenuOwner.closeMenu(false);
    }, true);
  }

  /* ------------------------------------------------------------------------
     3. Acordeão
     O HTML tem só o heading e o texto (tudo aberto sem JS). Aqui cada
     heading ganha um <button aria-expanded aria-controls> e o painel vira
     uma região. Os itens são independentes.
     ---------------------------------------------------------------------- */
  function initAccordion() {
    each(document.querySelectorAll('.accordion-item'), function (item) {
      var title = item.querySelector('.accordion-item__title');
      var panel = item.querySelector('.accordion-item__answer');
      if (!title || !panel || !panel.id) return;

      var label = document.createElement('span');
      label.textContent = title.textContent.trim();
      var icon = document.createElement('span');
      icon.className = 'accordion-item__icon';
      icon.setAttribute('aria-hidden', 'true');

      var button = document.createElement('button');
      button.type = 'button';
      button.id = panel.id + '-btn';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', panel.id);
      button.appendChild(label);
      button.appendChild(icon);
      title.textContent = '';
      title.appendChild(button);

      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', button.id);
      panel.inert = true; // fechado: fora do Tab e da leitura

      // <button> já responde a Enter e Espaço com "click"
      button.addEventListener('click', function () {
        var open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        item.toggleAttribute('data-open', open);
        panel.inert = !open;
      });
    });
  }

  /* ------------------------------------------------------------------------
     4. Zoom da obra
     Limites de 100% a 300%, de 50% em 50%. Com zoom > 100% o viewport rola
     e recebe foco, então as setas do teclado movem a imagem.
     ---------------------------------------------------------------------- */
  function initZoom() {
    var viewport = document.getElementById('obra-viewport');
    var controls = document.querySelector('.obra__zoom');
    var status = document.getElementById('obra-zoom-status');
    if (!viewport || !controls) return;

    var zoomIn = controls.querySelector('.obra__zoom-in');
    var zoomOut = controls.querySelector('.obra__zoom-out');
    var MIN = 1;
    var MAX = 3;
    var STEP = 0.5;
    var zoom = MIN;

    function apply(next) {
      // mantém o centro da imagem no centro do viewport
      var cx = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
      var cy = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;

      zoom = next;
      viewport.style.setProperty('--obra-zoom', zoom);

      if (zoom > MIN) {
        viewport.setAttribute('data-zoomed', '');
        viewport.tabIndex = 0;
        viewport.setAttribute('role', 'region');
        viewport.setAttribute('aria-label', 'Obra ampliada. Use as setas do teclado para mover a imagem.');
        viewport.scrollLeft = cx * viewport.scrollWidth - viewport.clientWidth / 2;
        viewport.scrollTop = cy * viewport.scrollHeight - viewport.clientHeight / 2;
      } else {
        viewport.removeAttribute('data-zoomed');
        viewport.removeAttribute('tabindex');
        viewport.removeAttribute('role');
        viewport.removeAttribute('aria-label');
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      }

      var focused = document.activeElement;
      zoomOut.disabled = zoom <= MIN;
      zoomIn.disabled = zoom >= MAX;
      // um botão desabilitado perde o foco: passa para o oposto
      if (focused === zoomIn && zoomIn.disabled) zoomOut.focus();
      if (focused === zoomOut && zoomOut.disabled) zoomIn.focus();
    }

    function announce() {
      if (!status) return;
      var text = 'Zoom da obra: ' + Math.round(zoom * 100) + '%.';
      if (zoom >= MAX) text += ' Zoom máximo.';
      if (zoom <= MIN) text += ' Zoom mínimo.';
      status.textContent = text;
    }

    zoomIn.addEventListener('click', function () {
      apply(Math.min(MAX, zoom + STEP));
      announce();
    });
    zoomOut.addEventListener('click', function () {
      apply(Math.max(MIN, zoom - STEP));
      announce();
    });

    controls.hidden = false;
  }

  function init() {
    initNav();
    initAudio();
    initAccordion();
    initZoom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
