<script setup lang="ts">
import type { DefaultTheme } from "vitepress/theme";
import Reicon from "./Reicon.vue";

const props = defineProps<{
  icon?: DefaultTheme.FeatureIcon;
  title: string;
  details?: string;
  link?: string;
  linkText?: string;
  rel?: string;
  target?: string;
}>();

const iconName = typeof props.icon === "string" && props.icon ? props.icon : "";
</script>

<template>
  <component
    :is="link ? 'a' : 'div'"
    class="VPFeature"
    :class="{ link: !!link }"
    :href="link || undefined"
    :rel="link ? rel : undefined"
    :target="link ? target : undefined"
  >
    <article class="box">
      <div v-if="iconName" class="icon">
        <Reicon :name="iconName" :size="28" />
      </div>
      <h2 class="title">{{ title }}</h2>
      <p v-if="details" class="details">{{ details }}</p>
      <div v-if="linkText" class="link-text">
        <p class="link-text-value">
          {{ linkText }} <Reicon name="ArrowRight" :size="14" class="link-text-icon" />
        </p>
      </div>
    </article>
  </component>
</template>
