import { useData } from 'vitepress';
import { type ComputedRef, computed } from 'vue';

export type Locale = 'en' | 'vi' | 'zh';

/** Picks the strings of the current page's language, English when there is no match. */
export function useLocale<T>(messages: Record<Locale, T>): ComputedRef<T> {
  const { lang } = useData();
  return computed(() => {
    const key = lang.value.slice(0, 2);
    return key === 'vi' || key === 'zh' ? messages[key] : messages.en;
  });
}
