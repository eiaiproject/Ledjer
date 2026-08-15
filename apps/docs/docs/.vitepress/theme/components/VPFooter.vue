<script setup lang="ts">
import { useData } from "vitepress";
import { useSidebar } from "vitepress/dist/client/theme-default/composables/sidebar";
import { normalizeLink } from "vitepress/dist/client/theme-default/support/utils";

const { theme, frontmatter } = useData();
const { hasSidebar } = useSidebar();
</script>

<template>
  <!-- Override default theme: columned footer so it is not a dead end.
       Data source: themeConfig.footer (message/copyright), footerLinks
       (Dokumentasi) and footerBottomLinks (Produk). -->
  <footer
    v-if="theme.footer && frontmatter.footer !== false"
    class="VPFooter"
    :class="{ 'has-sidebar': hasSidebar }"
  >
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <img
            v-if="theme.logo"
            class="footer-logo"
            :src="theme.logo.src"
            :alt="theme.logo.alt || 'Ledjer'"
            :width="theme.logo.width || 132"
            :height="theme.logo.height || 34"
          />
          <p v-if="theme.footer.message" class="footer-tagline" v-html="theme.footer.message" />
          <p v-if="theme.footer.copyright" class="footer-copyright" v-html="theme.footer.copyright" />
        </div>

        <nav v-if="theme.footerLinks?.length" class="footer-col" aria-label="Navigasi dokumentasi">
          <p class="footer-col-title">Dokumentasi</p>
          <ul class="footer-col-list">
            <li v-for="link in theme.footerLinks" :key="link.link">
              <a :href="normalizeLink(link.link)">{{ link.text }}</a>
            </li>
          </ul>
        </nav>

        <nav v-if="theme.footerBottomLinks?.length" class="footer-col" aria-label="Tautan produk">
          <p class="footer-col-title">Produk</p>
          <ul class="footer-col-list">
            <li v-for="link in theme.footerBottomLinks" :key="link.link">
              <a :href="normalizeLink(link.link)">{{ link.text }}</a>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </footer>
</template>
