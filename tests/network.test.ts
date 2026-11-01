import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installNetworkHook } from '../lib/network';

class FakeXHR extends EventTarget {
  status = 200;
  responseType = '';
  responseText = '';

  open(_method: string, _url: string | URL) {}

  send() {}

  complete(text: string) {
    this.responseText = text;
    this.dispatchEvent(new Event('loadend'));
  }
}

const originalOpen = FakeXHR.prototype.open;
const originalSend = FakeXHR.prototype.send;
let browserEvents: EventTarget;
const setLocation = (path: string | URL) => vi.stubGlobal('location', new URL(path, location.href));
const navigate = (path: string) => history.pushState({}, '', path);
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('location', new URL('http://localhost/dashboard'));
  browserEvents = new EventTarget();
  vi.stubGlobal('addEventListener', browserEvents.addEventListener.bind(browserEvents));
  vi.stubGlobal('history', {
    pushState(_data: unknown, _unused: string, url?: string | URL | null) { if (url != null) setLocation(url); },
    replaceState(_data: unknown, _unused: string, url?: string | URL | null) { if (url != null) setLocation(url); },
  });
  vi.stubGlobal('window', { fetch: vi.fn() });
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});

afterEach(() => {
  FakeXHR.prototype.open = originalOpen;
  FakeXHR.prototype.send = originalSend;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('network request screen attribution', () => {
  it('excludes a delayed fetch from the previous query and hash screen', async () => {
    let finish!: (response: Response) => void;
    window.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(json({ tab: 'two' }));
    const snapshot = installNetworkHook();

    navigate('/dashboard?tab=one#details');
    const first = window.fetch('/api/one');
    navigate('/dashboard?tab=two#overview');
    await window.fetch('/api/two');
    finish(json({ tab: 'one' }));
    expect(await (await first).text()).toBe('{"tab":"one"}');

    await vi.waitFor(() => expect(snapshot('/dashboard?tab=two#overview')).toHaveLength(1));
    expect(snapshot('/dashboard?tab=two#overview')).toMatchObject([
      { route: '/dashboard?tab=two#overview', url: 'http://localhost/api/two', bodyPreview: '{"tab":"two"}' },
    ]);
    expect(snapshot('/dashboard?tab=one#details')).toEqual([]);
  });

  it('attributes XHR at send time and excludes older delayed responses', () => {
    const snapshot = installNetworkHook();
    const first = new FakeXHR();
    first.open('GET', '/api/one');
    navigate('/dashboard?tab=one#details');
    first.send();
    const delayed = new FakeXHR();
    delayed.open('GET', '/api/old');
    delayed.send();
    first.complete('{"tab":"one"}');
    expect(snapshot('/dashboard?tab=one#details')).toMatchObject([
      { route: '/dashboard?tab=one#details', url: 'http://localhost/api/one', bodyPreview: '{"tab":"one"}' },
    ]);

    const second = new FakeXHR();
    second.open('GET', '/api/two');
    navigate('/dashboard?tab=two#overview');
    second.send();
    second.complete('{"tab":"two"}');
    delayed.complete('{"tab":"old"}');
    expect(snapshot('/dashboard?tab=two#overview')).toMatchObject([
      { route: '/dashboard?tab=two#overview', url: 'http://localhost/api/two', bodyPreview: '{"tab":"two"}', status: 200 },
    ]);
  });

  it('keeps failed requests out of later hash routes and records current failures', async () => {
    let fail!: (reason: Error) => void;
    window.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => (fail = reject)))
      .mockRejectedValueOnce(new TypeError('Current failure'));
    const snapshot = installNetworkHook();
    navigate('/dashboard#/one?sort=name');
    const pending = window.fetch('/api/failure');
    navigate('/dashboard#/two?sort=date');
    fail(new TypeError('Old failure'));
    await expect(pending).rejects.toThrow('Old failure');
    expect(snapshot('/dashboard#/two?sort=date')).toEqual([]);

    await expect(window.fetch('/api/current-failure')).rejects.toThrow('Current failure');
    expect(snapshot('/dashboard#/two?sort=date')).toMatchObject([
      { route: '/dashboard#/two?sort=date', status: 0, url: 'http://localhost/api/current-failure' },
    ]);
  });

  it('starts a new visit when returning to the same screen', async () => {
    window.fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true })));
    const snapshot = installNetworkHook();
    navigate('/dashboard?tab=one#details');
    await window.fetch('/api/first-visit');
    await vi.waitFor(() => expect(snapshot('/dashboard?tab=one#details')).toHaveLength(1));
    navigate('/dashboard?tab=two#details');
    navigate('/dashboard?tab=one#details');
    expect(snapshot('/dashboard?tab=one#details')).toEqual([]);

    await window.fetch('/api/second-visit');
    await vi.waitFor(() => expect(snapshot('/dashboard?tab=one#details')).toHaveLength(1));
    expect(snapshot('/dashboard?tab=one#details').map((entry) => entry.url)).toEqual(['http://localhost/api/second-visit']);
  });

  it('detects replaceState, back navigation and hash changes without new requests', async () => {
    window.fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true })));
    const snapshot = installNetworkHook();
    navigate('/dashboard?tab=one#details');
    await window.fetch('/api/first-visit');
    await vi.waitFor(() => expect(snapshot('/dashboard?tab=one#details')).toHaveLength(1));

    history.replaceState({}, '', '/dashboard?tab=two#details');
    setLocation('/dashboard?tab=one#details');
    browserEvents.dispatchEvent(new Event('popstate'));
    expect(snapshot('/dashboard?tab=one#details')).toEqual([]);
    await window.fetch('/api/back-visit');
    await vi.waitFor(() => expect(snapshot('/dashboard?tab=one#details')).toHaveLength(1));

    setLocation('/dashboard?tab=one#other');
    browserEvents.dispatchEvent(new Event('hashchange'));
    setLocation('/dashboard?tab=one#details');
    browserEvents.dispatchEvent(new Event('hashchange'));
    expect(snapshot('/dashboard?tab=one#details')).toEqual([]);
  });
});
