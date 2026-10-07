// Shared by the public renderer, admin editor, and server-side validator.
const text = (label, value = '', extra = {}) => ({ type: 'text', label, value, ...extra });
const area = (label, value = '') => text(label, value, { type: 'textarea' });
const bool = (label, value = false) => ({ type: 'boolean', label, value });
const url = (label, value = '') => text(label, value, { type: 'url' });
const asset = (label, accept = 'image') => text(label, '', { type: 'asset', accept });
const group = (label, fields) => ({ type: 'group', label, fields });
const list = (label, fields) => ({ type: 'list', label, item: group(label, fields), value: [] });
const settings = (label, title, description = '') => group('Section settings', {
  enabled: bool('Show this section', true), navLabel: text('Navigation label', label),
  eyebrow: text('Small heading', label), title: text('Section title', title),
  description: area('Introduction', description), emptyText: text('Message when there are no entries', 'New work will be shared here.'),
});
const buttons = () => list('Buttons', {
  label: text('Button label'), url: url('Destination (URL or #section)'),
  style: { type: 'select', label: 'Button style', value: 'gold', options: ['gold', 'ghost', 'text'] },
});

export const sectionIds = ['about', 'showreel', 'projects', 'gallery', 'skills', 'experience', 'achievements', 'contact'];
export const schema = {
  site: group('Identity & website', {
    name: text('Author name', 'Your name', { required: true, max: 120 }),
    brand: text('Header brand', 'Your name'), title: text('Browser title', 'Creative Portfolio'),
    description: area('Search and sharing description', 'A portfolio of creative work.'),
    keywords: text('Search keywords'), favicon: asset('Browser icon'),
    socialImage: asset('Social sharing image'), resume: asset('Résumé PDF', 'pdf'),
    resumeLabel: text('Résumé button label', 'Download résumé'),
    menuLabel: text('Menu heading', 'Menu'), adminLoginLabel: text('Admin login button label', 'Admin login'), backToTopLabel: text('Back-to-top link', 'Back to top'),
  }),
  hero: group('Home & introduction', {
    kicker: text('Small heading', 'CREATIVE PORTFOLIO'), title: text('Main headline', 'Your name'),
    highlight: text('Words to highlight', 'name'), roles: area('Roles (one per line)', 'Creative professional'),
    availability: text('Availability message', 'Available for collaborations.'),
    introEnabled: bool('Show opening animation', true), introPrimary: text('Opening wordmark, first part', 'YOUR'),
    introSecondary: text('Opening wordmark, second part', 'PORTFOLIO'),
    introMessage: text('Opening animation caption', 'Loading frames…'), scrollLabel: text('Scroll label', 'Scroll'),
    backgroundImage: asset('Hero background image'),
    overlay: { type: 'number', label: 'Background shading (%)', value: 70, min: 0, max: 100 },
    buttons: buttons(),
  }),
  appearance: group('Appearance', {
    accent: { type: 'color', label: 'Accent color', value: '#d4af37' },
    accentDark: { type: 'color', label: 'Accent gradient color', value: '#b8931f' },
    background: { type: 'color', label: 'Background color', value: '#0b0b0b' },
    backgroundEnd: { type: 'color', label: 'Background gradient color', value: '#070707' },
    text: { type: 'color', label: 'Text color', value: '#eeeeee' },
    font: { type: 'select', label: 'Body typeface', value: 'Poppins', options: ['Poppins', 'Montserrat', 'system-ui'] },
    headingFont: { type: 'select', label: 'Heading typeface', value: 'Montserrat', options: ['Montserrat', 'Poppins', 'system-ui'] },
    rounded: { type: 'number', label: 'Card corner radius (pixels)', value: 26, min: 0, max: 48 },
    motion: bool('Enable animations', true), cursor: bool('Enable cursor glow', true),
  }),
  order: { type: 'order', label: 'Section order', value: sectionIds },
  about: group('About & profile', {
    settings: settings('About', 'The person behind the work.'),
    biography: area('Biography'), photo: asset('Profile photograph'), photoAlt: text('Photo description', 'Portrait of the author'),
    badgeTitle: text('Photo badge title'), badgeSubtitle: text('Photo badge subtitle'),
    stats: list('Statistics', { value: text('Value'), label: text('Label') }),
    details: list('Profile details', { title: text('Title'), description: area('Description') }), buttons: buttons(),
  }),
  showreel: group('YouTube videos', {
    settings: settings('Showreel', 'Highlights. Frames. Moments.'),
    channelUrl: url('YouTube channel URL'), channelLabel: text('Channel button label', 'Visit channel'),
    videos: list('Videos', {
      id: text('Record ID', '', { hidden: true }), published: bool('Publish on portfolio'),
      title: text('Video title'), category: text('Category'),
      youtubeUrl: { type: 'video', label: 'YouTube video URL', value: '' },
      thumbnail: asset('Custom thumbnail (optional)'),
    }),
  }),
  projects: group('Projects & work', {
    settings: settings('Projects', 'Selected work.'), watchLabel: text('Project link label', 'View project'),
    detailsLabel: text('Detail page link label', 'Read the story'), galleryLabel: text('Project gallery heading', 'Project gallery'),
    backLabel: text('Back link label', 'Back to portfolio'), filtersEnabled: bool('Enable project search and category filters', true),
    searchLabel: text('Project search label', 'Search projects'), allLabel: text('All categories label', 'All work'), noResultsLabel: text('No search results message', 'No projects match your search.'),
    items: list('Projects', {
      id: text('Record ID', '', { hidden: true }), published: bool('Publish on portfolio'),
      title: text('Project title'), category: text('Category'), description: area('Description'),
      slug: text('Page address (leave empty to generate)'), body: area('Full project story'),
      roles: text('Your roles (comma separated)'), duration: text('Duration or date'),
      url: url('Project URL or YouTube link'), image: asset('Project image'), featured: bool('Feature this project'),
      gallery: list('Project gallery', { image: asset('Gallery image'), alt: text('Image description'), caption: area('Image caption') }),
    }),
  }),
  gallery: group('Pictures & gallery', {
    settings: settings('Gallery', 'In pictures.'),
    pictures: list('Pictures', { id: text('Record ID', '', { hidden: true }), published: bool('Publish on portfolio'), image: asset('Image'), title: text('Picture title'), caption: area('Caption'), alt: text('Image description') }),
  }),
  skills: group('Skills', {
    settings: settings('Skills', 'Creative + technical.'),
    groups: list('Skill groups', {
      title: text('Group title'),
      items: list('Skills in this group', { name: text('Skill name'), level: { type: 'number', label: 'Proficiency (%)', value: 80, min: 0, max: 100 } }),
    }),
  }),
  experience: group('Experience & timeline', {
    settings: settings('Timeline', 'The journey so far.'),
    items: list('Timeline entries', { title: text('Role or milestone'), period: text('Dates'), description: area('Description') }),
  }),
  achievements: group('Achievements', {
    settings: settings('Achievements', 'Recognition.'),
    items: list('Achievements', {
      id: text('Record ID', '', { hidden: true }), published: bool('Publish on portfolio'),
      title: text('Achievement title'), icon: text('Symbol or emoji', '★'), description: area('Description'),
      certificate: asset('Certificate PDF', 'pdf'), certificateLabel: text('Certificate link label', 'View certificate'),
      links: list('Certificates or links', { label: text('Link label'), url: url('URL') }),
    }),
  }),
  contact: group('Contact', {
    settings: settings('Contact', 'Let’s create something together.'),
    items: list('Contact details', { label: text('Label'), value: text('Display text'), url: url('Link (https:, mailto:, or tel:)') }),
  }),
  footer: group('Footer', {
    name: text('Footer name', 'Your name'), tagline: text('Footer tagline', 'Creative portfolio'),
    copyright: text('Copyright name', 'Your name'),
    links: list('Footer links', { label: text('Label'), url: url('URL') }),
  }),
};

export function defaultValue(field) {
  if (field.type === 'group') return Object.fromEntries(Object.entries(field.fields).map(([k, f]) => [k, defaultValue(f)]));
  return structuredClone(field.value);
}
export function createDefaultContent() {
  const content = Object.fromEntries(Object.entries(schema).map(([k, f]) => [k, defaultValue(f)]));
  content.hero.buttons = [{ label: 'View work', url: '#projects', style: 'gold' }, { label: 'Get in touch', url: '#contact', style: 'ghost' }];
  return content;
}

export function youtubeId(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const host = u.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = u.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(u.pathname.split('/')[1]) ? u.pathname.split('/')[2] : '');
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : '';
  } catch { return ''; }
}
export function safeUrl(value, assetOnly = false) {
  if (!value) return true;
  if (/[\u0000-\u0020\\]/.test(value)) return false;
  if (/^#[a-zA-Z][\w-]*$/.test(value)) return !assetOnly;
  if (/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif|pdf)$/.test(value)) return true;
  if (/^\/projects(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?$/.test(value)) return !assetOnly;
  try {
    const u = new URL(value);
    return !u.username && !u.password && (assetOnly ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']).includes(u.protocol);
  } catch { return false; }
}

export function validateContent(input) {
  function check(field, value, path) {
    const fail = (message) => { throw new Error(`${path}: ${message}`); };
    if (field.type === 'group') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('must be an object');
      return Object.fromEntries(Object.entries(field.fields).map(([k, f]) => [k, check(f, value[k], `${path}.${k}`)]));
    }
    if (field.type === 'list') {
      if (!Array.isArray(value) || value.length > 100) fail('must be a list of at most 100 entries');
      return value.map((v, i) => check(field.item, v, `${path}[${i}]`));
    }
    if (field.type === 'order') {
      if (!Array.isArray(value) || value.length !== sectionIds.length || new Set(value).size !== sectionIds.length || value.some(v => !sectionIds.includes(v))) fail('invalid section order');
      return [...value];
    }
    if (field.type === 'boolean') { if (typeof value !== 'boolean') fail('must be true or false'); return value; }
    if (field.type === 'number') {
      if (!Number.isFinite(value) || value < field.min || value > field.max) fail(`must be between ${field.min} and ${field.max}`);
      return value;
    }
    if (typeof value !== 'string' || value.length > (field.max || 12000)) fail('invalid or too long');
    if (field.required && !value.trim()) fail('is required');
    if (field.type === 'color' && !/^#[a-fA-F0-9]{6}$/.test(value)) fail('must be a hex color');
    if (field.type === 'select' && !field.options.includes(value)) fail('invalid option');
    if (['url', 'asset'].includes(field.type) && !safeUrl(value, field.type === 'asset')) fail('invalid or unsafe URL');
    if (field.type === 'asset' && value && new URL(value, 'http://localhost').pathname.toLowerCase().endsWith('.pdf') && field.accept !== 'pdf') fail('choose an image, not a PDF');
    if (field.type === 'asset' && field.accept === 'pdf' && value.startsWith('/uploads/') && !value.endsWith('.pdf')) fail('choose a PDF');
    if (field.type === 'video' && value && !youtubeId(value)) fail('enter a valid YouTube video URL');
    return value;
  }
  const result = check(group('Portfolio', schema), input, 'Portfolio');
  for (const project of result.projects.items) {
    if (project.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug)) throw new Error('Project page addresses may contain lowercase letters, numbers and hyphens.');
    if (project.published && (!project.title.trim() || !project.description.trim())) throw new Error('Published projects need a title and description.');
  }
  for (const video of result.showreel.videos) if (video.published && (!video.title.trim() || !youtubeId(video.youtubeUrl))) throw new Error('Published videos need a title and a valid YouTube URL.');
  for (const picture of result.gallery.pictures) if (picture.published && !picture.image) throw new Error('Published pictures need an image.');
  for (const award of result.achievements.items) if (award.published && !award.title.trim()) throw new Error('Published achievements need a title.');
  return result;
}

// Upgrade existing local content without replacing authored text or media.
export function migrateContent(input) {
  function hydrate(field, value) {
    if (field.type === 'group') return Object.fromEntries(Object.entries(field.fields).map(([k, f]) => [k, hydrate(f, value?.[k])]));
    if (field.type === 'list') return (Array.isArray(value) ? value : []).map(item => {
      const next = hydrate(field.item, item);
      if ('published' in field.item.fields && !('published' in item)) next.published = true;
      return next;
    });
    return value === undefined ? defaultValue(field) : value;
  }
  return hydrate(group('Portfolio', schema), input);
}
