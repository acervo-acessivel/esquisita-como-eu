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
     Cada .audio-player controla o seu <audio>. Só um toca por vez.
     ---------------------------------------------------------------------- */
  var RATES = [1, 1.5, 2];
  var players = [];

  function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    var s = Math.floor(seconds % 60);
    return Math.floor(seconds / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  function isoDuration(seconds) {
    if (!isFinite(seconds)) return 'PT0M0S';
    return 'PT' + Math.floor(seconds / 60) + 'M' + Math.floor(seconds % 60) + 'S';
  }

  function rateText(rate) {
    return String(rate).replace('.', ',') + 'x';
  }

  function setupPlayer(root) {
    var audio = root.querySelector('audio');
    var playBtn = root.querySelector('.audio-player__play');
    var muteBtn = root.querySelector('.audio-player__mute');
    var speedBtn = root.querySelector('.audio-player__speed');
    var progress = root.querySelector('.audio-player__progress');
    var times = root.querySelectorAll('.audio-player__time time');
    if (!audio || !playBtn) return null;

    audio.removeAttribute('controls');
    var name = root.getAttribute('data-audio-name') || 'áudio';
    var rateIndex = 0;

    function swapIcons(button, showFirst) {
      var icons = button.querySelectorAll('.icon');
      if (icons.length < 2) return;
      icons[0].hidden = !showFirst;
      icons[1].hidden = showFirst;
    }

    function setPlaying(playing) {
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', (playing ? 'Pausar ' : 'Ouvir ') + name);
      swapIcons(playBtn, !playing); // play.svg parado, pause.svg tocando
    }

    function setMuted(muted) {
      if (!muteBtn) return;
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.setAttribute('aria-label', muted ? 'Ativar som' : 'Silenciar áudio');
      swapIcons(muteBtn, !muted); // volume-on.svg com som, volume-off.svg mudo
    }

    function setSpeed() {
      var rate = RATES[rateIndex];
      audio.playbackRate = rate;
      if (!speedBtn) return;
      speedBtn.textContent = rateText(rate);
      speedBtn.setAttribute('aria-label', 'Velocidade de reprodução: ' + rateText(rate));
    }

    function updateTime() {
      if (times[0]) {
        times[0].textContent = formatTime(audio.currentTime);
        times[0].setAttribute('datetime', isoDuration(audio.currentTime));
      }
      if (progress && audio.duration) {
        progress.value = (audio.currentTime / audio.duration) * 100;
      }
    }

    function updateDuration() {
      if (times[1] && isFinite(audio.duration)) {
        times[1].textContent = formatTime(audio.duration);
        times[1].setAttribute('datetime', isoDuration(audio.duration));
      }
    }

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

    if (muteBtn) {
      muteBtn.addEventListener('click', function () { audio.muted = !audio.muted; });
    }

    if (speedBtn) {
      speedBtn.addEventListener('click', function () {
        rateIndex = (rateIndex + 1) % RATES.length;
        setSpeed();
      });
    }

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
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('volumechange', function () { setMuted(audio.muted); });

    setPlaying(false);
    setMuted(audio.muted);
    setSpeed();

    return { audio: audio };
  }

  function initAudio() {
    each(document.querySelectorAll('.audio-player'), function (root) {
      var player = setupPlayer(root);
      if (player) players.push(player);
    });
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
