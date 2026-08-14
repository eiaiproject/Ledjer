<script lang="ts" setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  active: boolean;
}>();

defineEmits<{
  (e: "click"): void;
}>();

// Provided by VPNav (same mechanism the default theme uses to close the screen).
const closeScreen = inject<() => void>("close-screen", () => {});

const button = ref<HTMLButtonElement | null>(null);

const label = computed(() => (props.active ? "Tutup navigasi" : "Buka navigasi"));

/** Focus the first focusable element inside the mobile screen after its transition. */
function focusFirstInScreen() {
  window.setTimeout(() => {
    const screen = document.getElementById("VPNavScreen");
    const first = screen?.querySelector<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])");
    first?.focus();
  }, 260); // matches the screen's fade transition (~0.25s)
}

watch(
  () => props.active,
  (open, wasOpen) => {
    if (open) {
      document.documentElement.classList.add("nav-screen-open"); // CSS locks body scroll
      focusFirstInScreen();
    } else if (wasOpen) {
      document.documentElement.classList.remove("nav-screen-open");
      button.value?.focus(); // return focus to the toggle
    }
  },
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.active) {
    closeScreen();
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.documentElement.classList.remove("nav-screen-open");
});
</script>

<template>
  <button
    ref="button"
    type="button"
    class="VPNavBarHamburger"
    :class="{ active }"
    :aria-label="label"
    :aria-expanded="active"
    aria-controls="VPNavScreen"
    @click="$emit('click')"
  >
    <span class="container">
      <span class="top" />
      <span class="middle" />
      <span class="bottom" />
    </span>
  </button>
</template>

<style scoped>
.VPNavBarHamburger {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 48px;
  height: var(--vp-nav-height);
}

@media (min-width: 768px) {
  .VPNavBarHamburger {
    display: none;
  }
}

.container {
  position: relative;
  width: 16px;
  height: 14px;
  overflow: hidden;
}

.VPNavBarHamburger:hover .top    { top: 0; left: 0; transform: translateX(4px); }
.VPNavBarHamburger:hover .middle { top: 6px; left: 0; transform: translateX(0); }
.VPNavBarHamburger:hover .bottom { top: 12px; left: 0; transform: translateX(8px); }

.VPNavBarHamburger.active .top    { top: 6px; transform: translateX(0) rotate(225deg); }
.VPNavBarHamburger.active .middle { top: 6px; transform: translateX(16px); }
.VPNavBarHamburger.active .bottom { top: 6px; transform: translateX(0) rotate(135deg); }

.VPNavBarHamburger.active:hover .top,
.VPNavBarHamburger.active:hover .middle,
.VPNavBarHamburger.active:hover .bottom {
  background-color: var(--vp-c-text-2);
  transition: top .25s, background-color .25s, transform .25s;
}

.top,
.middle,
.bottom {
  position: absolute;
  width: 16px;
  height: 2px;
  background-color: var(--vp-c-text-1);
  transition: top .25s, background-color .5s, transform .25s;
}

.top    { top: 0; left: 0; transform: translateX(0); }
.middle { top: 6px; left: 0; transform: translateX(8px); }
.bottom { top: 12px; left: 0; transform: translateX(4px); }
</style>
