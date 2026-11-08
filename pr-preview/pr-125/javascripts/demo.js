// Playable demos in the blog: <div class="debrief-demo" data-demo="?panels=tools"
// data-caption="..."></div> becomes a "Start the demo" button that loads the
// playground (play/index.html, Debrief running in the browser) in place. Loading
// waits for the reader, and only one demo runs at a time: starting one puts any
// other on the page back to its button, so a page never runs two Pythons at once.
(function () {
  const script = document.currentScript || document.querySelector('script[src*="javascripts/demo.js"]');
  const root = new URL("..", script.src); // the site's root, wherever it is served
  let running; // the element whose demo is running, with how to stop it

  function mount(element) {
    if (element.dataset.mounted) return;
    element.dataset.mounted = "yes";
    const url = new URL(`play/${element.dataset.page || "index.html"}${element.dataset.demo || ""}`, root).href;
    const fullScreen = () => {
      const full = document.createElement("a");
      full.href = url;
      full.className = "md-button";
      full.textContent = "Open full screen";
      full.target = "_blank";
      full.rel = "noopener";
      return full;
    };

    function placeholder() {
      const start = document.createElement("button");
      start.className = "md-button md-button--primary";
      start.textContent = "▶ Start the demo";
      const note = document.createElement("p");
      note.className = "debrief-demo-note";
      note.textContent =
        element.dataset.caption ||
        (element.dataset.page ? "" : null) ||
        "Debrief's own map, tool forms and Python tools, running in your browser. Nothing is sent anywhere; the first start downloads about 16 MB of Python.";
      const bar = document.createElement("div");
      bar.className = "debrief-demo-bar";
      bar.append(start, fullScreen());
      element.replaceChildren(note, bar);
      start.addEventListener("click", () => play(note));
    }

    function play(note) {
      if (running && running.element !== element) running.stop();
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = "Debrief demo";
      frame.className = "debrief-demo-frame";
      if (element.dataset.height) frame.style.height = element.dataset.height;
      frame.allow = "fullscreen";
      element.replaceChildren(note, frame, fullScreen());
      running = { element, stop: placeholder };
    }

    placeholder();
  }
  const mountAll = () => {
    running = undefined; // a new page: the old one's demos are gone
    document.querySelectorAll(".debrief-demo").forEach(mount);
  };
  // Material's instant navigation swaps pages without reloading.
  if (window.document$) window.document$.subscribe(mountAll);
  else document.addEventListener("DOMContentLoaded", mountAll);
})();
