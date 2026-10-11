// A stand-in for https://www.youtube.com/iframe_api in end-to-end runs: a 4-second video
// that plays at normal speed as soon as it is ready, so a drill reaches its done threshold
// in about three seconds. It speaks only the part of the IFrame Player API the drill player
// uses; no video is fetched.
(function () {
  window.YT = {
    PlayerState: { PLAYING: 1, ENDED: 0 },
    Player: function (el, opts) {
      var frame = document.createElement("iframe");
      frame.setAttribute("src", "about:blank");
      frame.dataset.videoId = opts.videoId;
      el.replaceWith(frame);
      var duration = 4;
      var started = null;
      var t = function () {
        return started === null ? 0 : Math.min(duration, (performance.now() - started) / 1000);
      };
      setTimeout(function () {
        started = performance.now();
        if (opts.events && opts.events.onReady) opts.events.onReady();
      }, 10);
      return {
        getDuration: function () {
          return duration;
        },
        getCurrentTime: t,
        getPlayerState: function () {
          return t() < duration ? 1 : 0;
        },
        destroy: function () {},
      };
    },
  };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
