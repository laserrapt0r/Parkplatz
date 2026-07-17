/* Parkplatz - internationalization (German / English) */
(function () {
  'use strict';

  const STRINGS = {
    de: {
      tagline: 'Befreie das rote Auto aus dem Stau.',
      play: 'Spielen',
      howto: 'Anleitung',
      solvedLabel: 'Gelöst',
      chooseLevel: 'Level wählen',
      levelsShort: 'Level',
      levelWord: 'Level',
      movesWord: 'Züge',
      parWord: 'Minimum',
      undo: 'Rückgängig',
      restart: 'Neustart',
      hint: 'Tipp',
      solved: 'Gelöst!',
      retry: 'Nochmal',
      next: 'Weiter',
      howtoTitle: 'So wird gespielt',
      howto1: 'Ziehe die Fahrzeuge mit der Maus – längs oder quer.',
      howto2: 'Fahrzeuge bewegen sich nur in ihre Richtung und können nicht überlappen.',
      howto3: 'Mache den Weg frei, damit das rote Auto zum Ausgang fahren kann.',
      howto4: 'Weniger Züge = mehr Sterne. Schaffst du das Minimum, gibt es drei Sterne.',
      gotit: "Los geht's",
      // difficulty tiers
      leicht: 'Leicht',
      mittel: 'Mittel',
      schwer: 'Schwer',
      sehr_schwer: 'Sehr schwer',
      // win messages by star count
      msg3: 'Perfekt! Kein Zug zu viel.',
      msg2: 'Stark gelöst – geht noch etwas kürzer.',
      msg1: 'Geschafft! Versuch es mit weniger Zügen.',
      allDone: 'Alle Level geschafft! Bravo!',
      hintNone: 'Kein Tipp verfügbar.',
      hintSolved: 'Fast geschafft – fahr hinaus!',
    },
    en: {
      tagline: 'Free the red car from the jam.',
      play: 'Play',
      howto: 'How to play',
      solvedLabel: 'Solved',
      chooseLevel: 'Choose a level',
      levelsShort: 'Levels',
      levelWord: 'Level',
      movesWord: 'Moves',
      parWord: 'Par',
      undo: 'Undo',
      restart: 'Restart',
      hint: 'Hint',
      solved: 'Solved!',
      retry: 'Retry',
      next: 'Next',
      howtoTitle: 'How to play',
      howto1: 'Drag the vehicles with the mouse – lengthwise or sideways.',
      howto2: 'Vehicles only move along their own axis and cannot overlap.',
      howto3: 'Clear the way so the red car can reach the exit.',
      howto4: 'Fewer moves = more stars. Match the minimum for three stars.',
      gotit: "Let's go",
      leicht: 'Easy',
      mittel: 'Medium',
      schwer: 'Hard',
      sehr_schwer: 'Very hard',
      msg3: 'Perfect! Not a move to spare.',
      msg2: 'Nicely done – it can be a bit shorter.',
      msg1: 'Solved! Try it with fewer moves.',
      allDone: 'Every level cleared! Bravo!',
      hintNone: 'No hint available.',
      hintSolved: 'Almost there – drive it out!',
    },
  };

  let lang = 'de';

  const I18n = {
    get lang() { return lang; },
    set(l) {
      lang = STRINGS[l] ? l : 'de';
      document.documentElement.lang = lang;
      this.apply();
    },
    toggle() {
      this.set(lang === 'de' ? 'en' : 'de');
      return lang;
    },
    t(key) {
      return (STRINGS[lang] && STRINGS[lang][key]) || (STRINGS.de[key]) || key;
    },
    apply() {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      const langBtn = document.getElementById('btn-lang');
      if (langBtn) langBtn.textContent = lang.toUpperCase();
      document.dispatchEvent(new CustomEvent('langchange'));
    },
  };

  window.I18n = I18n;
})();
