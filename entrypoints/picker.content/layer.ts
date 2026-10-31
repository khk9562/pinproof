export class OverlayLayer {
  private surfaces: HTMLElement[];

  constructor(private host: HTMLElement) {
    this.surfaces = [...document.querySelectorAll<HTMLElement>('dialog:modal, [popover]:popover-open')];
    for (const selector of ['dialog:modal', '[popover]:popover-open']) {
      const focused = document.activeElement?.closest<HTMLElement>(selector);
      if (focused) this.surfaces = [...this.surfaces.filter((surface) => surface !== focused), focused];
    }
    host.popover = 'manual';
    document.addEventListener('beforetoggle', this.onToggle, true);
    document.addEventListener('toggle', this.onToggle, true);
    new MutationObserver((records) => {
      if (!host.isConnected || records.some((record) => record.type === 'attributes')) this.sync();
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'popover'] });
    this.sync();
  }

  private onToggle = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === this.host) return;
    const opening = (event as ToggleEvent).newState === 'open';
    if (!(target instanceof HTMLDialogElement) && !target.hasAttribute('popover')) return;
    this.surfaces = this.surfaces.filter((surface) => surface !== target);
    if (opening) this.surfaces.push(target);
    if (event.type === 'toggle') this.sync(opening);
  };

  private sync(raise = false) {
    this.surfaces = this.surfaces.filter((surface) => surface.isConnected && surface.matches(':modal, :popover-open'));
    const modal = this.surfaces.findLast((surface) => surface.matches(':modal'));
    const popover = this.surfaces.findLast((surface) => surface.matches(':popover-open') && (!modal || modal.contains(surface)));
    const parent = popover ?? modal ?? document.documentElement;
    const focused = this.host.shadowRoot?.activeElement as HTMLElement | null;
    if (this.host.parentElement !== parent) parent.appendChild(this.host);
    if (raise && this.host.matches(':popover-open')) this.host.hidePopover();
    if (!this.host.matches(':popover-open')) this.host.showPopover();
    focused?.focus({ preventScroll: true });
  }
}
