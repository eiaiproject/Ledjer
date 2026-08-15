<script setup lang="ts">
import Reicon from "./Reicon.vue";
</script>

<template>
  <section class="security-section" aria-labelledby="security-heading">
    <div class="container">
      <div class="security-content">
        <p class="security-eyebrow">Keamanan data</p>
        <h2 id="security-heading" class="security-heading">Keamanan &amp; akses</h2>
        <p class="security-body">
          Data setiap bisnis dipisahkan dan akses dapat dibatasi. Setiap perubahan
          penting tercatat sehingga dapat ditelusuri.
        </p>
        <a class="security-link" href="/panduan/keamanan-akun">
          <span>Pelajari keamanan Ledjer</span>
          <Reicon name="ArrowRight" :size="14" class="security-link-icon" aria-hidden="true" />
        </a>
      </div>
    </div>
  </section>
</template>
