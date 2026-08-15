import DefaultTheme from "vitepress/theme";
import { inBrowser, type Theme } from "vitepress";
import "./custom.css";
import Reicon from "./components/Reicon.vue";
import SecuritySection from "./components/SecuritySection.vue";

/**
 * Mark the active nav/sidebar link with aria-current="page".
 * VitePress applies an .active class but does not set the ARIA attribute.
 */
function setAriaCurrent() {
  document
    .querySelectorAll('.VPNavBarMenuLink[aria-current], .VPSidebarItem .link[aria-current]')
    .forEach((el) => el.removeAttribute("aria-current"));
  document
    .querySelectorAll(".VPNavBarMenuLink.active, .VPSidebarItem .link.active")
    .forEach((el) => el.setAttribute("aria-current", "page"));
}

/**
 * VPSidebarItem hardcodes aria-label="toggle section" (English) for the
 * collapsible sidebar groups. Patch it to Bahasa Indonesia in the browser.
 */
function localizeSidebarLabels() {
  document
    .querySelectorAll('[aria-label="toggle section"]')
    .forEach((el) => el.setAttribute("aria-label", "Buka bagian"));
}

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component("Reicon", Reicon);
    app.component("SecuritySection", SecuritySection);

    // Update on every route change (client-side) and after the initial mount.
    // Guarded with inBrowser: during SSR render there is no window/document.
    if (inBrowser) {
      router.onAfterRouteChanged = () =>
        window.setTimeout(() => {
          setAriaCurrent();
          localizeSidebarLabels();
        }, 0);
      app.mixin({
        mounted() {
          setAriaCurrent();
          localizeSidebarLabels();
        },
      });
    }
  },
};

export default theme;
