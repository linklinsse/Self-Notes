// Applies the cached theme variables written by ThemeProvider (localStorage "sn.themeVars").
// Loaded synchronously in <head> so the first paint already has the right colors.
(function () {
  try {
    var cached = JSON.parse(localStorage.getItem('sn.themeVars') || 'null');
    if (!cached || !cached.vars) return;
    var root = document.documentElement;
    for (var name in cached.vars) root.style.setProperty(name, cached.vars[name]);
    root.style.colorScheme = cached.dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && cached.vars['--sn-bg']) meta.setAttribute('content', cached.vars['--sn-bg']);
  } catch (e) {
    // no cache: ThemeProvider applies the default theme on mount
  }
})();
