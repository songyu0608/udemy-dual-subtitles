(() => {
  "use strict";

  const KEY = "__udemyDualTranslator";
  if (window[KEY]) return;

  const LOG = "[Udemy Dual Subtitles]";
  const LANGS = { sourceLanguage: "en", targetLanguage: "ko" };
  const CACHE_LIMIT = 1000;

  let translator = null;
  let creating = null;
  const progressCallbacks = new Set();
  const cache = new Map();
  const dictionary = window.__udemyDualSubtitleDictionary;

  // ---- Translator ----------------------------------------------------------

  // Creates the translator once. A model download needs a user gesture, so a
  // click handler (caption button, first page click) may call this directly.
  // onProgress receives 0-100 while the model downloads.
  async function start(onProgress) {
    if (translator) return translator;
    if (onProgress) progressCallbacks.add(onProgress);
    if (creating) return creating;

    if (typeof Translator === "undefined" || typeof Translator.create !== "function") {
      console.warn(LOG, "Translator API is unavailable. Chrome 138+ desktop is required.");
      return null;
    }

    creating = (async () => {
      try {
        translator = await Translator.create({
          ...LANGS,
          monitor(m) {
            m.addEventListener("downloadprogress", e => {
              const percent = Math.round(e.loaded * 100);
              console.info(LOG, `Model download ${percent}%`);
              for (const callback of progressCallbacks) callback(percent);
            });
          }
        });
        return translator;
      } catch (error) {
        console.error(LOG, "Failed to start the translator.", error);
        return null;
      } finally {
        creating = null;
        progressCallbacks.clear();
      }
    })();
    return creating;
  }

  // ---- Translation -----------------------------------------------------------

  // Kept terms stay in English; pairs are replaced with their Korean meaning.
  // If the translator drops a placeholder, fall back to a plain translation
  // instead of showing a broken sentence.
  async function translateWithDictionary(source) {
    if (!translator) throw new Error("The translator is not ready.");
    if (!dictionary) return translator.translate(source);

    const { text, terms, meanings } = dictionary.protect(source);
    if (!terms.length) return translator.translate(source);

    const restored = dictionary.restore(await translator.translate(text), terms, meanings);
    if (restored !== null) return restored;

    console.debug(LOG, "Dictionary placeholder lost; using plain translation.", source);
    return translator.translate(source);
  }

  // Reuse translation requests for repeated captions.
  function translate(source) {
    if (!source) return Promise.resolve("");
    if (cache.has(source)) return cache.get(source);

    const promise = translateWithDictionary(source).catch(error => {
      cache.delete(source);
      throw error;
    });

    cache.set(source, promise);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return promise;
  }

  window[KEY] = {
    isReady: () => Boolean(translator),
    start,
    translate
  };


})();
