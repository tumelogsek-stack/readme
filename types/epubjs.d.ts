declare module 'epubjs' {
  export interface NavItem {
    id: string;
    href: string;
    label: string;
    subitems?: NavItem[];
    parent?: string;
  }

  export interface Navigation {
    toc: NavItem[];
    landmarks: any[];
    length: number;
  }

  export interface Book {
    ready: Promise<void>;
    renderTo(container: HTMLElement, options: RenditionOptions): Rendition;
    locations: {
      generate(chars: number): Promise<string[]>;
      save(): string;
      load(locations: string): void;
      percentageFromCfi(cfi: string): number;
      locationFromCfi(cfi: string): number | string;
      length(): number;
    };
    spine: {
      get(href: string): { cfiBase?: string; href: string } | undefined;
    };
    navigation: Navigation;
    coverUrl(): Promise<string | undefined>;
    destroy(): void;
  }

  export interface RenditionOptions {
    width?: number | string;
    height?: number | string;
    spread?: string;
    flow?: string;
    manager?: string;
  }

  export interface Rendition {
    display(target?: string): Promise<void>;
    themes: {
      default(styles: Record<string, Record<string, string>>): void;
    };
    on(event: string, callback: (...args: any[]) => void): void;
    annotations: {
      highlight(cfiRange: string, data?: Record<string, unknown>, cb?: (e: Event) => void, className?: string, styles?: Record<string, string>): void;
      remove(cfiRange: string, type: string): void;
    };
    next(): Promise<void>;
    prev(): Promise<void>;
    destroy(): void;
    manager?: {
      container: HTMLElement;
    };
    spread(mode: string): void;
    resize(width: number | string, height: number | string): void;
  }

  export default function ePub(data: ArrayBuffer | string, options?: any): Book;
}
