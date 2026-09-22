/* ==========================================================================
   Esquisita como eu — interações (etapa 4)

   JS puro, sem dependências. A página funciona sem este arquivo: o conteúdo
   está todo no HTML, os itens de acessibilidade ficam abertos e cada áudio
   tem o player nativo. Ao carregar, este script marca <html class="js"> e o
   CSS troca esses fallbacks pelos controles do desenho.

   1. Navegação por âncoras   2. Player de áudio   3. Acordeão   4. Modal da obra
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
  var RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
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
      // Ícone + / −: SVG de 1em, com linhas em em (o CSS define traço e cor)
      var NS = 'http://www.w3.org/2000/svg';
      var icon = document.createElementNS(NS, 'svg');
      icon.setAttribute('class', 'accordion-item__icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');
      ['accordion-item__icon-h', 'accordion-item__icon-v'].forEach(function (name) {
        var line = document.createElementNS(NS, 'line');
        line.setAttribute('class', name);
        line.setAttribute('x1', '0.15625em');
        line.setAttribute('x2', '0.84375em');
        line.setAttribute('y1', '0.5em');
        line.setAttribute('y2', '0.5em');
        icon.appendChild(line);
      });

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
     4. Modal da obra
     No Hero, o link "Ampliar imagem da obra" (que sem JS abre a imagem em
     nova aba) vira um botão que abre um <dialog> nativo (showModal). O dialog
     é montado na primeira abertura, então a imagem grande só carrega aí.
     Zoom de 1x a 4x, de 0,5 em 0,5. Com zoom > 1x o stage rola: mouse
     arrasta, setas movem, toque usa a rolagem e a pinça nativas.
     ---------------------------------------------------------------------- */
  function initModal() {
    var link = document.querySelector('.obra__expand');
    var heroImg = document.querySelector('.obra__img');
    if (!link || !heroImg || typeof HTMLDialogElement === 'undefined') return;

    var MIN = 1;
    var MAX = 4;
    var STEP = 0.5;
    var ARROW_STEP = 48; // px por seta
    var TITLE = 'Esquisita Como Eu, de Laura Castilhos';
    var zoom = MIN;
    var dialog, stage, zoomIn, zoomOut, status;

    // Sem JS é um link; com JS, um botão
    var opener = document.createElement('button');
    opener.type = 'button';
    opener.className = link.className;
    opener.setAttribute('aria-label', 'Ampliar imagem da obra');
    opener.setAttribute('aria-haspopup', 'dialog');
    opener.innerHTML = link.innerHTML;
    link.parentNode.replaceChild(opener, link);

    function icon(name) {
      return '<img src="assets/icons/' + name + '.svg" width="24" height="24" alt="">';
    }

    function build() {
      dialog = document.createElement('dialog');
      dialog.className = 'obra-modal';
      dialog.setAttribute('aria-labelledby', 'obra-modal-titulo');
      dialog.innerHTML =
        '<h2 class="visually-hidden" id="obra-modal-titulo"></h2>' +
        '<div class="obra-modal__stage" id="obra-modal-stage"><img draggable="false"></div>' +
        '<button type="button" class="obra-modal__btn obra-modal__close" aria-label="Fechar imagem ampliada">' + icon('close') + '</button>' +
        '<div class="obra-modal__zoom" role="group" aria-label="Zoom da imagem">' +
          '<button type="button" class="obra-modal__btn obra-modal__zoom-out" aria-label="Diminuir zoom da imagem" aria-controls="obra-modal-stage" disabled>' + icon('zoom-out') + '</button>' +
          '<button type="button" class="obra-modal__btn obra-modal__zoom-in" aria-label="Aumentar zoom da imagem" aria-controls="obra-modal-stage">' + icon('zoom-in') + '</button>' +
        '</div>' +
        '<p class="visually-hidden" role="status"></p>';
      dialog.querySelector('h2').textContent = TITLE;

      stage = dialog.querySelector('.obra-modal__stage');
      var img = stage.querySelector('img');
      img.src = link.getAttribute('href'); // a imagem maior disponível
      img.alt = heroImg.getAttribute('alt'); // o mesmo alt do Hero
      zoomIn = dialog.querySelector('.obra-modal__zoom-in');
      zoomOut = dialog.querySelector('.obra-modal__zoom-out');
      status = dialog.querySelector('[role="status"]');

      dialog.querySelector('.obra-modal__close').addEventListener('click', function () { dialog.close(); });
      zoomIn.addEventListener('click', function () { setZoom(Math.min(MAX, zoom + STEP), true); });
      zoomOut.addEventListener('click', function () { setZoom(Math.max(MIN, zoom - STEP), true); });

      // Clique no fundo (a área escura fora da obra): só se o clique começou e
      // terminou fora da obra, sem arrastar. O stage cobre o dialog inteiro, e a
      // <img> cobre o stage, então a área da obra é calculada (object-fit: contain).
      function outsideArt(e) {
        var box = img.getBoundingClientRect();
        var scale = img.naturalWidth ? Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight) : 1;
        var w = img.naturalWidth * scale;
        var h = img.naturalHeight * scale;
        var left = box.left + (box.width - w) / 2;
        var top = box.top + (box.height - h) / 2;
        return e.clientX < left || e.clientX > left + w || e.clientY < top || e.clientY > top + h;
      }
      function isBackground(e) {
        return (e.target === dialog || e.target === stage || e.target === img) && outsideArt(e);
      }
      var press = null;
      dialog.addEventListener('pointerdown', function (e) {
        press = isBackground(e) ? { x: e.clientX, y: e.clientY, moved: false } : null;
      });
      dialog.addEventListener('pointermove', function (e) {
        if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 4) press.moved = true;
      });
      dialog.addEventListener('click', function (e) {
        var close = press && !press.moved && isBackground(e);
        press = null;
        if (close) dialog.close();
      });

      // Setas movem a imagem com zoom, onde quer que esteja o foco no modal
      dialog.addEventListener('keydown', function (e) {
        if (zoom <= MIN || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        var dx = 0;
        var dy = 0;
        if (e.key === 'ArrowLeft') dx = -ARROW_STEP;
        else if (e.key === 'ArrowRight') dx = ARROW_STEP;
        else if (e.key === 'ArrowUp') dy = -ARROW_STEP;
        else if (e.key === 'ArrowDown') dy = ARROW_STEP;
        else return;
        e.preventDefault();
        stage.scrollBy(dx, dy);
      });

      // Arrastar com mouse ou caneta. Toque não passa por aqui: rola e faz
      // pinça pelo navegador.
      var drag = null;
      stage.addEventListener('pointerdown', function (e) {
        if (zoom <= MIN || e.pointerType === 'touch' || e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
        stage.setPointerCapture(e.pointerId);
        stage.setAttribute('data-dragging', '');
        e.preventDefault();
      });
      stage.addEventListener('pointermove', function (e) {
        if (!drag) return;
        stage.scrollLeft = drag.left - (e.clientX - drag.x);
        stage.scrollTop = drag.top - (e.clientY - drag.y);
      });
      function endDrag() {
        drag = null;
        stage.removeAttribute('data-dragging');
      }
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);

      dialog.addEventListener('close', onClose);
      document.body.appendChild(dialog);
    }

    function setZoom(next, announce) {
      // mantém o centro da imagem no centro da janela
      var cx = (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth;
      var cy = (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight;

      zoom = next;
      dialog.style.setProperty('--obra-zoom', zoom);

      if (zoom > MIN) {
        stage.setAttribute('data-zoomed', '');
        stage.tabIndex = 0;
        stage.setAttribute('role', 'region');
        stage.setAttribute('aria-label', 'Imagem ampliada. Use as setas do teclado para mover a imagem.');
        stage.scrollLeft = cx * stage.scrollWidth - stage.clientWidth / 2;
        stage.scrollTop = cy * stage.scrollHeight - stage.clientHeight / 2;
      } else {
        stage.removeAttribute('data-zoomed');
        stage.removeAttribute('tabindex');
        stage.removeAttribute('role');
        stage.removeAttribute('aria-label');
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      }

      var focused = document.activeElement;
      zoomOut.disabled = zoom <= MIN;
      zoomIn.disabled = zoom >= MAX;
      // um botão desabilitado perde o foco: passa para o oposto
      if (focused === zoomIn && zoomIn.disabled) zoomOut.focus();
      if (focused === zoomOut && zoomOut.disabled) zoomIn.focus();

      if (announce) {
        var text = 'Zoom da imagem: ' + Math.round(zoom * 100) + '%.';
        if (zoom >= MAX) text += ' Zoom máximo.';
        if (zoom <= MIN) text += ' Zoom mínimo.';
        status.textContent = text;
      }
    }

    // Trava a rolagem da página, compensando a barra de rolagem que some
    function lockScroll() {
      var html = document.documentElement;
      var bar = window.innerWidth - html.clientWidth;
      if (bar > 0) html.style.paddingInlineEnd = bar + 'px';
      html.classList.add('is-modal-open');
    }

    function unlockScroll() {
      var html = document.documentElement;
      html.classList.remove('is-modal-open');
      html.style.removeProperty('padding-inline-end');
    }

    // Fechou (Esc, botão ou fundo): zoom volta a 1x, rolagem volta, foco volta
    function onClose() {
      setZoom(MIN, false);
      status.textContent = '';
      unlockScroll();
      opener.focus();
    }

    opener.addEventListener('click', function () {
      if (!dialog) build();
      lockScroll();
      dialog.showModal();
    });
  }

  function init() {
    initNav();
    initAudio();
    initAccordion();
    initModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
