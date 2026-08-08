import type { SkillCategory } from '@nodo/contracts';

export type SkillSeed = { slug: string; label: string; category: SkillCategory };

/**
 * Vocabulario canónico. Prerrequisito de despliegue: todo el matching depende
 * de él (ADR-002).
 *
 * Las categorías amplias — `frontend`, `backend`, `mobile`, `data-ai`,
 * `design`, `product`, `infra` — existen también como slug propio, porque un
 * equipo suele pedir "un backend" y no "alguien que sepa Redis". La extracción
 * las infiere además del stack concreto (AC-01).
 *
 * `svelte` está deliberadamente fuera: es el ejemplo con el que el prompt de
 * docs/06 enseña a mapear una tecnología desconocida a su categoría más
 * cercana. Añadirlo dejaría ese ejemplo sin caso.
 */
export const SKILLS: SkillSeed[] = [
  // ─── frontend ─────────────────────────────────────────────────────────────
  { slug: 'frontend', label: 'Frontend', category: 'frontend' },
  { slug: 'react', label: 'React', category: 'frontend' },
  { slug: 'angular', label: 'Angular', category: 'frontend' },
  { slug: 'vue', label: 'Vue', category: 'frontend' },
  { slug: 'nextjs', label: 'Next.js', category: 'frontend' },
  { slug: 'typescript', label: 'TypeScript', category: 'frontend' },
  { slug: 'javascript', label: 'JavaScript', category: 'frontend' },
  { slug: 'tailwind', label: 'Tailwind', category: 'frontend' },
  { slug: 'css', label: 'CSS', category: 'frontend' },
  { slug: 'accessibility', label: 'Accesibilidad', category: 'frontend' },

  // ─── backend ──────────────────────────────────────────────────────────────
  { slug: 'backend', label: 'Backend', category: 'backend' },
  { slug: 'go', label: 'Go', category: 'backend' },
  { slug: 'node', label: 'Node.js', category: 'backend' },
  { slug: 'python', label: 'Python', category: 'backend' },
  { slug: 'rust', label: 'Rust', category: 'backend' },
  { slug: 'java', label: 'Java', category: 'backend' },
  { slug: 'csharp', label: 'C#', category: 'backend' },
  { slug: 'php', label: 'PHP', category: 'backend' },
  { slug: 'ruby', label: 'Ruby', category: 'backend' },
  { slug: 'postgresql', label: 'PostgreSQL', category: 'backend' },
  { slug: 'mysql', label: 'MySQL', category: 'backend' },
  { slug: 'mongodb', label: 'MongoDB', category: 'backend' },
  { slug: 'redis', label: 'Redis', category: 'backend' },
  { slug: 'graphql', label: 'GraphQL', category: 'backend' },
  { slug: 'rest-apis', label: 'APIs REST', category: 'backend' },
  { slug: 'realtime', label: 'Tiempo real', category: 'backend' },

  // ─── mobile ───────────────────────────────────────────────────────────────
  { slug: 'mobile', label: 'Móvil', category: 'mobile' },
  { slug: 'flutter', label: 'Flutter', category: 'mobile' },
  { slug: 'react-native', label: 'React Native', category: 'mobile' },
  { slug: 'swift', label: 'Swift', category: 'mobile' },
  { slug: 'kotlin', label: 'Kotlin', category: 'mobile' },
  { slug: 'android', label: 'Android', category: 'mobile' },
  { slug: 'ios', label: 'iOS', category: 'mobile' },

  // ─── data-ai ──────────────────────────────────────────────────────────────
  { slug: 'data-ai', label: 'Datos e IA', category: 'data-ai' },
  { slug: 'llm-apis', label: 'APIs de LLM', category: 'data-ai' },
  { slug: 'rag', label: 'RAG', category: 'data-ai' },
  { slug: 'prompt-eng', label: 'Prompt engineering', category: 'data-ai' },
  { slug: 'ml', label: 'Machine Learning', category: 'data-ai' },
  { slug: 'deep-learning', label: 'Deep Learning', category: 'data-ai' },
  { slug: 'nlp', label: 'NLP', category: 'data-ai' },
  { slug: 'computer-vision', label: 'Visión por computador', category: 'data-ai' },
  { slug: 'data-analysis', label: 'Análisis de datos', category: 'data-ai' },
  { slug: 'data-engineering', label: 'Ingeniería de datos', category: 'data-ai' },
  { slug: 'data-viz', label: 'Visualización', category: 'data-ai' },

  // ─── design ───────────────────────────────────────────────────────────────
  { slug: 'design', label: 'Diseño', category: 'design' },
  { slug: 'figma', label: 'Figma', category: 'design' },
  { slug: 'ui-design', label: 'Diseño UI', category: 'design' },
  { slug: 'ux-research', label: 'UX Research', category: 'design' },
  { slug: 'motion', label: 'Motion design', category: 'design' },
  { slug: 'prototyping', label: 'Prototipado', category: 'design' },
  { slug: 'illustration', label: 'Ilustración', category: 'design' },
  { slug: 'branding', label: 'Branding', category: 'design' },
  { slug: 'design-systems', label: 'Sistemas de diseño', category: 'design' },

  // ─── product ──────────────────────────────────────────────────────────────
  { slug: 'product', label: 'Producto', category: 'product' },
  { slug: 'pitching', label: 'Pitching', category: 'product' },
  { slug: 'user-research', label: 'Investigación de usuarios', category: 'product' },
  { slug: 'growth', label: 'Growth', category: 'product' },
  { slug: 'project-mgmt', label: 'Gestión de proyecto', category: 'product' },
  { slug: 'business-model', label: 'Modelo de negocio', category: 'product' },

  // ─── infra ────────────────────────────────────────────────────────────────
  { slug: 'infra', label: 'Infraestructura', category: 'infra' },
  { slug: 'docker', label: 'Docker', category: 'infra' },
  { slug: 'kubernetes', label: 'Kubernetes', category: 'infra' },
  { slug: 'aws', label: 'AWS', category: 'infra' },
  { slug: 'gcp', label: 'Google Cloud', category: 'infra' },
  { slug: 'terraform', label: 'Terraform', category: 'infra' },
  { slug: 'ci-cd', label: 'CI/CD', category: 'infra' },
  { slug: 'linux', label: 'Linux', category: 'infra' },
  { slug: 'observability', label: 'Observabilidad', category: 'infra' },

  // ─── other ────────────────────────────────────────────────────────────────
  { slug: 'testing', label: 'Testing', category: 'other' },
  { slug: 'security', label: 'Seguridad', category: 'other' },
  { slug: 'git', label: 'Git', category: 'other' },
  { slug: 'technical-writing', label: 'Escritura técnica', category: 'other' },
  { slug: 'blockchain', label: 'Blockchain', category: 'other' },
  { slug: 'game-dev', label: 'Desarrollo de videojuegos', category: 'other' },
  { slug: 'hardware', label: 'Hardware e IoT', category: 'other' },
];

/**
 * Alias de la extracción por LLM. Sostienen la precisión: un sinónimo fuera
 * del vocabulario se pierde si no está aquí (ADR-002).
 */
export const SKILL_ALIASES: Array<{ alias: string; slug: string }> = [
  // frontend
  { alias: 'react.js', slug: 'react' },
  { alias: 'reactjs', slug: 'react' },
  { alias: 'angularjs', slug: 'angular' },
  { alias: 'vue.js', slug: 'vue' },
  { alias: 'vuejs', slug: 'vue' },
  { alias: 'nuxt', slug: 'vue' },
  { alias: 'next', slug: 'nextjs' },
  { alias: 'next.js', slug: 'nextjs' },
  { alias: 'remix', slug: 'react' },
  { alias: 'ts', slug: 'typescript' },
  { alias: 'js', slug: 'javascript' },
  { alias: 'ecmascript', slug: 'javascript' },
  { alias: 'tailwindcss', slug: 'tailwind' },
  { alias: 'sass', slug: 'css' },
  { alias: 'scss', slug: 'css' },
  { alias: 'html', slug: 'frontend' },
  { alias: 'a11y', slug: 'accessibility' },
  { alias: 'svelte', slug: 'frontend' },
  { alias: 'astro', slug: 'frontend' },

  // backend
  { alias: 'golang', slug: 'go' },
  { alias: 'nodejs', slug: 'node' },
  { alias: 'node.js', slug: 'node' },
  { alias: 'express', slug: 'node' },
  { alias: 'nest', slug: 'node' },
  { alias: 'nestjs', slug: 'node' },
  { alias: 'fastify', slug: 'node' },
  { alias: 'hono', slug: 'node' },
  { alias: 'deno', slug: 'node' },
  { alias: 'bun', slug: 'node' },
  { alias: 'django', slug: 'python' },
  { alias: 'flask', slug: 'python' },
  { alias: 'fastapi', slug: 'python' },
  { alias: 'spring', slug: 'java' },
  { alias: 'spring boot', slug: 'java' },
  { alias: 'dotnet', slug: 'csharp' },
  { alias: '.net', slug: 'csharp' },
  { alias: 'c#', slug: 'csharp' },
  { alias: 'laravel', slug: 'php' },
  { alias: 'rails', slug: 'ruby' },
  { alias: 'postgres', slug: 'postgresql' },
  { alias: 'psql', slug: 'postgresql' },
  { alias: 'supabase', slug: 'postgresql' },
  { alias: 'mariadb', slug: 'mysql' },
  { alias: 'mongo', slug: 'mongodb' },
  { alias: 'api', slug: 'rest-apis' },
  { alias: 'apis', slug: 'rest-apis' },
  { alias: 'websockets', slug: 'realtime' },
  { alias: 'websocket', slug: 'realtime' },
  { alias: 'microservicios', slug: 'backend' },
  { alias: 'microservices', slug: 'backend' },

  // mobile
  { alias: 'dart', slug: 'flutter' },
  { alias: 'react native', slug: 'react-native' },
  { alias: 'swiftui', slug: 'swift' },
  { alias: 'jetpack compose', slug: 'kotlin' },
  { alias: 'móvil', slug: 'mobile' },
  { alias: 'apps móviles', slug: 'mobile' },

  // data-ai
  { alias: 'openai', slug: 'llm-apis' },
  { alias: 'anthropic', slug: 'llm-apis' },
  { alias: 'claude', slug: 'llm-apis' },
  { alias: 'gpt', slug: 'llm-apis' },
  { alias: 'gemini', slug: 'llm-apis' },
  { alias: 'groq', slug: 'llm-apis' },
  { alias: 'llm', slug: 'llm-apis' },
  { alias: 'llms', slug: 'llm-apis' },
  { alias: 'langchain', slug: 'rag' },
  { alias: 'llamaindex', slug: 'rag' },
  { alias: 'embeddings', slug: 'rag' },
  { alias: 'vector database', slug: 'rag' },
  { alias: 'pgvector', slug: 'rag' },
  { alias: 'prompt engineering', slug: 'prompt-eng' },
  { alias: 'prompting', slug: 'prompt-eng' },
  { alias: 'machine learning', slug: 'ml' },
  { alias: 'aprendizaje automático', slug: 'ml' },
  { alias: 'scikit-learn', slug: 'ml' },
  { alias: 'pytorch', slug: 'deep-learning' },
  { alias: 'tensorflow', slug: 'deep-learning' },
  { alias: 'redes neuronales', slug: 'deep-learning' },
  { alias: 'visión artificial', slug: 'computer-vision' },
  { alias: 'opencv', slug: 'computer-vision' },
  { alias: 'pandas', slug: 'data-analysis' },
  { alias: 'numpy', slug: 'data-analysis' },
  { alias: 'jupyter', slug: 'data-analysis' },
  { alias: 'etl', slug: 'data-engineering' },
  { alias: 'airflow', slug: 'data-engineering' },
  { alias: 'spark', slug: 'data-engineering' },
  { alias: 'd3', slug: 'data-viz' },
  { alias: 'd3.js', slug: 'data-viz' },
  { alias: 'ia', slug: 'data-ai' },
  { alias: 'inteligencia artificial', slug: 'data-ai' },

  // design
  { alias: 'diseño', slug: 'design' },
  { alias: 'ui', slug: 'ui-design' },
  { alias: 'ux', slug: 'ux-research' },
  { alias: 'ui/ux', slug: 'ui-design' },
  { alias: 'sketch', slug: 'figma' },
  { alias: 'adobe xd', slug: 'figma' },
  { alias: 'framer', slug: 'prototyping' },
  { alias: 'after effects', slug: 'motion' },
  { alias: 'animación', slug: 'motion' },
  { alias: 'ilustración', slug: 'illustration' },
  { alias: 'marca', slug: 'branding' },
  { alias: 'design system', slug: 'design-systems' },

  // product
  { alias: 'producto', slug: 'product' },
  { alias: 'product management', slug: 'product' },
  { alias: 'pm', slug: 'product' },
  { alias: 'pitch', slug: 'pitching' },
  { alias: 'entrevistas de usuario', slug: 'user-research' },
  { alias: 'scrum', slug: 'project-mgmt' },
  { alias: 'agile', slug: 'project-mgmt' },
  { alias: 'ágil', slug: 'project-mgmt' },
  { alias: 'negocio', slug: 'business-model' },

  // infra
  { alias: 'k8s', slug: 'kubernetes' },
  { alias: 'amazon web services', slug: 'aws' },
  { alias: 'google cloud', slug: 'gcp' },
  { alias: 'azure', slug: 'infra' },
  { alias: 'vercel', slug: 'infra' },
  { alias: 'railway', slug: 'infra' },
  { alias: 'devops', slug: 'infra' },
  { alias: 'github actions', slug: 'ci-cd' },
  { alias: 'gitlab ci', slug: 'ci-cd' },
  { alias: 'ubuntu', slug: 'linux' },
  { alias: 'bash', slug: 'linux' },
  { alias: 'grafana', slug: 'observability' },
  { alias: 'prometheus', slug: 'observability' },

  // other
  { alias: 'qa', slug: 'testing' },
  { alias: 'pruebas', slug: 'testing' },
  { alias: 'vitest', slug: 'testing' },
  { alias: 'jest', slug: 'testing' },
  { alias: 'playwright', slug: 'testing' },
  { alias: 'cypress', slug: 'testing' },
  { alias: 'ciberseguridad', slug: 'security' },
  { alias: 'pentesting', slug: 'security' },
  { alias: 'github', slug: 'git' },
  { alias: 'documentación', slug: 'technical-writing' },
  { alias: 'web3', slug: 'blockchain' },
  { alias: 'solidity', slug: 'blockchain' },
  { alias: 'unity', slug: 'game-dev' },
  { alias: 'godot', slug: 'game-dev' },
  { alias: 'unreal', slug: 'game-dev' },
  { alias: 'iot', slug: 'hardware' },
  { alias: 'arduino', slug: 'hardware' },
  { alias: 'raspberry pi', slug: 'hardware' },
];
