/** Lower-case and strip diacritics so "acao" matches "AÇÃO" and "Ação" (DEF-12). */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
