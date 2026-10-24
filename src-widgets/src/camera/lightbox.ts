/* Large view of the camera widget: an overlay directly in document.body (outside the tile, whose glass filter would
 * otherwise trap position:fixed), with title, time, pills, close button and Escape. Plain DOM (a React portal would
 * bubble its events through the vis-2 widget tree), styled by the widget CSS (classes gh-cam-*). */
import { ICONS } from '../core/icons';

export interface LightboxPill {
    kind: 'ok' | 'warn' | 'crit' | 'info' | 'idle';
    live: boolean;
    text: string;
}

export interface LightboxView {
    title: string;
    dark: boolean;
    /** Image, or null for the placeholder */
    src: string | null;
    time: string;
    pills: LightboxPill[];
    /** Glashaus icon name or image URL */
    icon?: string;
    accent: string;
    closeLabel: string;
    dialogLabel: string;
    emptyTitle: string;
    emptyText: string;
}

function esc(s: string): string {
    return s.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
    );
}

/** Icon markup like GhIcon (line icon or image) */
function iconHtml(name: string | undefined): string {
    if (!name) {
        return '';
    }
    if (/^(data:|https?:|\/|\.\/)/.test(name) || name.includes('.svg') || name.includes('.png')) {
        return `<img src="${esc(name)}" alt="" style="width:19px;height:19px;object-fit:contain">`;
    }
    const d = ICONS[name];
    if (!d) {
        return '';
    }
    const a = (k: string, v: string | undefined): string => (v ? ` ${k}="${esc(v)}"` : '');
    return `<svg aria-hidden="true" viewBox="${esc(d.viewBox || '0 0 24 24')}" fill="${esc(d.fill || 'none')}" stroke="${esc(d.stroke || 'currentColor')}"${a('stroke-width', d['stroke-width'])}${a('stroke-linecap', d['stroke-linecap'])}${a('stroke-linejoin', d['stroke-linejoin'])}>${d.inner}</svg>`;
}

const CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export class Lightbox {
    private root: HTMLDivElement | null = null;

    private last = '';

    private openedAt = 0;

    private returnFocus: HTMLElement | null = null;

    constructor(private readonly onClose: () => void) {}

    get isOpen(): boolean {
        return !!this.root;
    }

    /** Opens the view (or updates it when it is open) */
    show(v: LightboxView, returnFocus?: HTMLElement | null): void {
        if (typeof document === 'undefined') {
            return;
        }
        if (!this.root) {
            const root = document.createElement('div');
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.addEventListener('click', this.onBackdrop);
            document.body.appendChild(root);
            window.addEventListener('keydown', this.onKey, true);
            this.root = root;
            this.last = '';
            this.openedAt = Date.now();
            this.returnFocus = returnFocus || null;
        }
        this.render(v);
    }

    hide(): void {
        if (!this.root) {
            return;
        }
        window.removeEventListener('keydown', this.onKey, true);
        this.root.removeEventListener('click', this.onBackdrop);
        this.root.remove();
        this.root = null;
        this.last = '';
        const f = this.returnFocus;
        this.returnFocus = null;
        f?.focus?.();
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.onClose();
        } else if (e.key === 'Tab') {
            // modal: the close button is the only control, focus stays on it
            e.preventDefault();
            this.root?.querySelector<HTMLElement>('[data-gh-close]')?.focus();
        }
    };

    private onBackdrop = (e: MouseEvent): void => {
        const t = e.target as HTMLElement | null;
        if (!t) {
            return;
        }
        if (t.closest('[data-gh-close]')) {
            this.onClose();
            return;
        }
        // a click outside the card closes (not the click that opened the view)
        if (!t.closest('.gh-cam-card') && Date.now() - this.openedAt > 300) {
            this.onClose();
        }
    };

    private render(v: LightboxView): void {
        const root = this.root;
        if (!root) {
            return;
        }
        root.className = `gh gh-cam-lb${v.dark ? ' gh-dark' : ''}`;
        root.setAttribute('aria-label', v.dialogLabel);
        const head =
            `<div class="gh-cam-h"><span class="gh-ico" style="--gh-c:${esc(v.accent)}">${iconHtml(v.icon)}</span>` +
            `<span class="gh-cam-name">${esc(v.title)}</span>${
                v.time ? `<span class="gh-cam-meta">${esc(v.time)}</span>` : ''
            }<span class="gh-cam-pills">${v.pills
                .map(
                    p =>
                        `<span class="gh-pill ${p.kind}${p.live ? ' live' : ''}"><span class="gh-pill-t">${esc(p.text)}</span></span>`,
                )
                .join('')}</span>` +
            `<button type="button" class="gh-circ" data-gh-close aria-label="${esc(v.closeLabel)}" title="${esc(v.closeLabel)}">${CLOSE}</button></div>`;
        const body = v.src
            ? `<img src="${esc(v.src)}" alt="${esc(v.title)}" draggable="false">`
            : `<div class="gh-cam-empty"><span class="gh-cam-empty-ico">${iconHtml('cam')}</span><b>${esc(v.emptyTitle)}</b><small>${esc(v.emptyText)}</small></div>`;
        const card = root.querySelector('.gh-cam-card');
        if (!card) {
            root.innerHTML = `<div class="gh-cam-card gh-glass">${head}<div class="gh-cam-big">${body}</div></div>`;
            this.last = head + body;
            root.querySelector<HTMLElement>('[data-gh-close]')?.focus();
            return;
        }
        if (head + body === this.last) {
            return;
        }
        const focused = document.activeElement === root.querySelector('[data-gh-close]');
        const h = card.querySelector('.gh-cam-h');
        if (h) {
            h.outerHTML = head;
        }
        const big = card.querySelector('.gh-cam-big');
        const img = big?.querySelector('img');
        if (img && v.src) {
            // swap only the source: no flicker
            if (img.getAttribute('src') !== v.src) {
                img.setAttribute('src', v.src);
            }
            img.setAttribute('alt', v.title);
        } else if (big) {
            big.innerHTML = body;
        }
        this.last = head + body;
        if (focused) {
            root.querySelector<HTMLElement>('[data-gh-close]')?.focus();
        }
    }
}
