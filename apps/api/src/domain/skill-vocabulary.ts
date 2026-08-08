import type { SkillRef } from '@nodo/contracts';

/**
 * Vocabulario cargado desde la base de datos, con resolución de alias en
 * memoria. Se recarga por proceso: el vocabulario no cambia en runtime
 * (ADR-002), así que cachearlo es seguro.
 */
export class SkillVocabulary {
  private readonly bySlug = new Map<string, SkillRef>();
  private readonly aliasToSlug = new Map<string, string>();

  constructor(skills: SkillRef[], aliases: Array<{ alias: string; slug: string }>) {
    for (const skill of skills) this.bySlug.set(skill.slug, skill);
    for (const { alias, slug } of aliases) this.aliasToSlug.set(alias.toLowerCase(), slug);
  }

  /** Slug directo o alias → slug canónico. `undefined` si no existe ninguno. */
  resolve = (input: string): string | undefined => {
    const slug = input.toLowerCase().trim();
    if (this.bySlug.has(slug)) return slug;
    return this.aliasToSlug.get(slug);
  };

  get = (slug: string): SkillRef | undefined => this.bySlug.get(slug);

  all = (): SkillRef[] => [...this.bySlug.values()];

  /** Para el prompt de extracción de docs/06: "lista de slugs con label y categoría". */
  promptCatalog = (): string =>
    this.all()
      .map((s) => `${s.slug} (${s.label}, ${s.category})`)
      .join('\n');
}
