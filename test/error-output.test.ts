import { describe, expect, it } from 'vitest';
import { ERROR_LABEL, renderError } from '../src/error-output';

interface StubSpan {
  tag: string;
  className: string;
  textContent: string | null;
}

/**
 * A stub span factory and a host that REFUSES html: the host is a Proxy that throws on
 * any innerHTML or outerHTML assignment, so the shape CodeQL flagged cannot come back
 * as a different sink and still pass.
 */
function harness(): {
  host: { replaceChildren(...nodes: never[]): void };
  factory: { createElement(tag: 'span'): StubSpan };
  received: () => StubSpan[];
} {
  let received: StubSpan[] = [];
  const bare = {
    replaceChildren(...nodes: never[]): void {
      received = nodes as unknown as StubSpan[];
    },
  };
  const host = new Proxy(bare, {
    set(target, property, value) {
      if (property === 'innerHTML' || property === 'outerHTML') {
        throw new Error(`the error panel assigned ${String(property)}`);
      }
      return Reflect.set(target, property, value);
    },
  });
  return {
    host,
    factory: { createElement: (tag: 'span'): StubSpan => ({ tag, className: '', textContent: null }) },
    received: () => received,
  };
}

describe('the error panel', () => {
  it('renders the label and the message as two spans of text', () => {
    const h = harness();
    renderError(h.host, h.factory, 'Not hex at offset 2');

    const spans = h.received();
    expect(spans.map((s) => s.tag)).toEqual(['span', 'span']);
    expect(spans.map((s) => s.className)).toEqual(['label', 'error-msg']);
    expect(spans[0].textContent).toBe(ERROR_LABEL);
    expect(spans[1].textContent).toBe('Not hex at offset 2');
  });

  it('writes a message that looks like markup as characters', () => {
    const h = harness();
    const payload = '<img src=x onerror="document.title=\'xss\'">';
    renderError(h.host, h.factory, `Invalid input: ${payload}`);

    // The payload survives as TEXT, character for character. With innerHTML this is an
    // element with a live onerror attribute.
    expect(h.received()[1].textContent).toBe(`Invalid input: ${payload}`);
  });

  it('replaces the previous error rather than appending to it', () => {
    const h = harness();
    renderError(h.host, h.factory, 'first');
    renderError(h.host, h.factory, 'second');
    expect(h.received()[1].textContent).toBe('second');
    expect(h.received()).toHaveLength(2);
  });
});
