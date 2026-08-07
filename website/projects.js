const menuButton = document.querySelector(".menu-button");
const mainNavigation = document.querySelector("#main-navigation");
const closeMobileNavigation = () => {
  mainNavigation?.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
};
const demoModal = document.querySelector("#demo-modal");
const demoWorkspace = document.querySelector("#demo-workspace");
const demoButtons = document.querySelectorAll("[data-demo-view]");
const projectImage = document.querySelector("#project-image");
const projectType = document.querySelector("#project-type");
const projectNumber = document.querySelector("#project-number");
const projectTitle = document.querySelector("#project-title");
const projectSummary = document.querySelector("#project-summary");
const projectThemes = document.querySelector("#project-themes");
const projectLaunch = document.querySelector("#project-launch");
const projectModuleList = document.querySelector("#project-module-list");

const demoViews = {
  hospitality: {
    eyebrow: "Ocean Boulevard · EPOS",
    title: "Service, sales and the shift in one view.",
    summary: "A touch-first till connected to stock, staff, cash, assistance and the daily operation.",
    metrics: [["Today", "£4,286"], ["Orders", "312"], ["Average sale", "£13.74"], ["Till health", "Online"]],
    visual: `<div class="pos-demo"><div class="pos-products"><header><strong>Quick sale</strong><span>Kelly's Kiosk · Till 02</span></header><div class="product-grid"><button data-demo-action="Chocolate cone|4.50">Chocolate cone<small>£4.50</small></button><button data-demo-action="Vanilla sundae|5.20">Vanilla sundae<small>£5.20</small></button><button data-demo-action="Iced coffee|3.80">Iced coffee<small>£3.80</small></button><button data-demo-action="Family bundle|18.00">Family bundle<small>£18.00</small></button><button data-demo-action="Bottled water|2.20">Bottled water<small>£2.20</small></button><button data-demo-action="Fresh donut|3.40">Fresh donut<small>£3.40</small></button></div></div><aside class="pos-basket"><header><strong>Current order</strong><button type="button" data-clear-basket>Clear</button></header><div class="basket-lines"><p class="empty-basket">Choose a product to begin.</p></div><footer><span>Total<strong class="basket-total">£0.00</strong></span><button type="button" data-pay>Take payment</button><p class="payment-status"></p></footer></aside></div>`,
  },
  workforce: {
    eyebrow: "Ocean Boulevard · Team",
    title: "Everyone knows what today requires.",
    summary: "Shifts, tasks, availability, leave and announcements without the rota living in five different places.",
    metrics: [["On shift", "18"], ["Open tasks", "7"], ["Coverage", "100%"], ["Pending leave", "2"]],
    visual: `<div class="workforce-demo"><section><header><div><strong>Today · Monday 6 August</strong><span>18 team members scheduled</span></div><button type="button">Publish rota</button></header><div class="shift-row"><time>08:30</time><span class="avatar">EM</span><div><strong>Ella Miles</strong><small>Opening · Front of house</small></div><em>Checked in</em></div><div class="shift-row"><time>09:00</time><span class="avatar">JT</span><div><strong>Jay Turner</strong><small>Kelly's Kiosk · Service</small></div><em>On site</em></div><div class="shift-row"><time>10:00</time><span class="avatar">AK</span><div><strong>Amelia King</strong><small>Rides · Operations</small></div><em class="soon">Starts soon</em></div></section><aside><header><strong>Priority actions</strong><span>7 open</span></header><label><input type="checkbox" />Confirm freezer temperature</label><label><input type="checkbox" />Restock outside kiosk</label><label><input type="checkbox" />Review closing variance</label><label><input type="checkbox" />Sign weekly safety brief</label></aside></div>`,
  },
  stock: {
    eyebrow: "Ocean Boulevard · Stock",
    title: "Know what is where, what is moving and what runs out next.",
    summary: "Counts, deliveries and sales signals become one clear stock position across every location.",
    metrics: [["Stock value", "£18.4k"], ["Locations", "6"], ["Needs action", "4"], ["Accuracy", "97.8%"]],
    visual: `<div class="stock-demo"><header><strong>Inventory position</strong><div><button class="is-active" type="button">All locations</button><button type="button">Low stock</button><button type="button">Deliveries</button></div></header><div class="stock-table"><div class="stock-head"><span>Product</span><span>Location</span><span>On hand</span><span>Forecast</span><span>Status</span></div><div><span><strong>Vanilla soft mix</strong><small>SKU-MIX-014</small></span><span>Main freezer</span><span>14 boxes</span><span>1.5 days</span><em class="at-risk">Order now</em></div><div><span><strong>Waffle cones</strong><small>SKU-CONE-006</small></span><span>Kelly's Kiosk</span><span>182 units</span><span>4.2 days</span><em>Healthy</em></div><div><span><strong>Iced coffee cups</strong><small>SKU-CUP-022</small></span><span>Drinks station</span><span>64 units</span><span>2.1 days</span><em class="watch">Watch</em></div><div><span><strong>Chocolate sauce</strong><small>SKU-SAUCE-003</small></span><span>Outside kiosk</span><span>9 bottles</span><span>6.8 days</span><em>Healthy</em></div></div></div>`,
  },
  safety: {
    eyebrow: "Ocean Boulevard · Safety",
    title: "Checks become evidence, ownership and action.",
    summary: "Routine inspections, incidents and maintenance live together so nothing important disappears into a paper folder.",
    metrics: [["Checks today", "28/30"], ["Open issues", "3"], ["Stop-use", "0"], ["Evidence", "Complete"]],
    visual: `<div class="safety-demo"><section class="safety-list"><header><strong>Today's assurance</strong><span>93% complete</span></header><button type="button"><i class="good"></i><span><strong>Opening ride checks</strong><small>Signed by A. King · 08:44</small></span><em>Complete</em></button><button type="button"><i class="good"></i><span><strong>Freezer temperatures</strong><small>6 units · all within range</small></span><em>Complete</em></button><button type="button"><i class="warn"></i><span><strong>Outside kiosk inspection</strong><small>Loose cabinet hinge recorded</small></span><em>Action raised</em></button><button type="button"><i></i><span><strong>Closing cash procedure</strong><small>Due after service</small></span><em>Scheduled</em></button></section><aside class="issue-panel"><span>Maintenance action</span><h3>Loose cabinet hinge</h3><p>Outside kiosk · Reported 09:18</p><dl><div><dt>Severity</dt><dd>Normal</dd></div><div><dt>Owner</dt><dd>Maintenance</dd></div><div><dt>Due</dt><dd>Today, 16:00</dd></div><div><dt>Evidence</dt><dd>2 photos</dd></div></dl><button type="button">Open action</button></aside></div>`,
  },
  agency: {
    eyebrow: "AquaCRM product · Aqua CRM",
    title: "From first lead to live client, nothing loses its context.",
    summary: "Our modular operating product connects sales, delivery, finance, portals, development and support.",
    metrics: [["Active clients", "24"], ["Pipeline", "£84k"], ["Due this week", "16"], ["Client health", "92%"]],
    visual: `<div class="agency-demo"><aside><strong>Sales pipeline</strong><span>£84,200 weighted value</span><div class="pipeline"><article><small>Scouting · 18</small><p>Riverside Hotel<em>Property</em></p><p>Northline Motors<em>Automotive</em></p></article><article><small>Meeting · 6</small><p>Arden Group<em>Portal + web</em></p><p>Foundry Fitness<em>Operations</em></p></article><article><small>Proposal · 3</small><p>Brackley Estate<em>£18,500</em></p><p>Atelier Nine<em>£9,800</em></p></article></div></aside><section><header><strong>What needs attention</strong><span>Live</span></header><div class="agency-action"><i class="warn"></i><span><strong>Contract awaiting signature</strong><small>Brackley Estate · 2 days</small></span><button type="button">Review</button></div><div class="agency-action"><i class="good"></i><span><strong>Client approved homepage</strong><small>Atelier Nine · 14 min ago</small></span><button type="button">Open</button></div><div class="agency-action"><i></i><span><strong>Monthly invoice due</strong><small>Ocean Boulevard · Friday</small></span><button type="button">Prepare</button></div></section></div>`,
  },
};

const projects = {
  ocean: {
    number: "Project 01", title: "Ocean Boulevard", type: "Hospitality · Operations",
    image: "/assets/ocean-boulevard-operations.jpg", alt: "Ocean Boulevard kiosk overlooking the seafront",
    summary: "Hospitality, attractions, retail and staff operations joined into one adaptable system.",
    themes: ["Customer service", "Team operations", "Management oversight"], launchView: "hospitality", realDemo: true,
    showcase: { local: "http://localhost:3042/showcase", production: "https://ocean-boulevard.vercel.app/showcase" },
    moduleRoutes: { hospitality: "/admin/pos", workforce: "/admin/shifts", stock: "/admin/stock", safety: "/admin/maintenance" },
    modules: [["hospitality", "EPOS & service", "Tills, products, payments and daily service."], ["workforce", "Staff operations", "Shifts, tasks, leave and team records."], ["stock", "Stock control", "Counts, locations, forecasts and exceptions."], ["safety", "Safety & compliance", "Checks, incidents and accountable sign-off."]],
  },
  aquacrm: {
    number: "Project 02 · AquaCRM product", title: "Aqua CRM", type: "Business · Operating platform",
    image: "/assets/aquacrm-workspace.png", alt: "Aqua CRM business operating platform",
    summary: "Our modular platform for managing the journey from first contact through sales, delivery, finance, support and long-term performance.",
    themes: ["Commercial control", "Client delivery", "Operational intelligence"], launchView: "agency", realDemo: true,
    showcase: { local: "http://localhost:3041/showcase", production: "https://aqua-crm.com/showcase" },
    modules: [["agency", "Agency operating system", "Sales, clients, delivery, finance, support and performance in one workspace."]],
  },
  beast: {
    number: "Project 03", title: "Beast Commerce", type: "Commerce · Customer experience",
    image: "/assets/beast-commerce.jpg", alt: "Beast outdoor commerce brand",
    summary: "A connected storefront and operations suite covering products, orders, fulfilment, customers, partners and service.",
    themes: ["Unified commerce", "Order fulfilment", "Customer retention"], launchView: "commerce", realDemo: true,
    showcase: { local: "http://localhost:3043/showcase", production: "https://beast-marks.vercel.app/showcase" },
    moduleRoutes: { commerce: "/admin", orders: "/admin/orders", fulfilment: "/admin/fulfilment", catalogue: "/admin/store/products" },
    modules: [["commerce", "Commerce overview", "Trading, operations and customer signals in one view."], ["orders", "Orders", "Inspect and manage every purchase from payment to handover."], ["fulfilment", "Fulfilment", "Inventory, workflow, deliveries and exceptions."], ["catalogue", "Products", "Products, collections, pricing and stock structure."]],
  },
};

let activeProjectName = "ocean";

function renderProject(projectName) {
  const project = projects[projectName] || projects.ocean;
  activeProjectName = projects[projectName] ? projectName : "ocean";
  document.querySelectorAll("[data-project-select]").forEach((button) => {
    const active = button.dataset.projectSelect === projectName;
    button.classList.toggle("is-active", active);
    if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", String(active));
  });
  projectImage.src = project.image;
  projectImage.alt = project.alt;
  projectImage.classList.toggle("is-interface", projectName === "aquacrm");
  projectType.textContent = project.type;
  projectNumber.textContent = project.number;
  projectTitle.textContent = project.title;
  projectSummary.textContent = project.summary;
  projectThemes.innerHTML = project.themes.map((theme) => `<li>${theme}</li>`).join("");
  projectLaunch.dataset.projectView = project.launchView;
  projectLaunch.setAttribute("aria-label", `Explore ${project.title} project`);
  projectLaunch.querySelector("strong").textContent = project.realDemo ? "Open live demo" : "Explore system";
  projectModuleList.innerHTML = project.modules.map(([view, title, summary], index) => `<button type="button" data-project-module="${view}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${title}</strong><p>${summary}</p><em>Open →</em></button>`).join("");
  const url = new URL(window.location.href);
  url.searchParams.set("project", projectName);
  window.history.replaceState({}, "", url);
}

function renderDemo(viewName) {
  const view = demoViews[viewName] || demoViews.hospitality;
  demoButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.demoView === viewName));
  demoWorkspace.innerHTML = `<header class="demo-workspace-heading"><div><p class="eyebrow">${view.eyebrow}</p><h2 id="demo-title">${view.title}</h2><p>${view.summary}</p></div><a class="demo-enquire" href="/#contact">Build around my business →</a></header><div class="demo-metrics">${view.metrics.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("")}</div><div class="demo-visual">${view.visual}</div>`;
  let basket = [];
  demoWorkspace.querySelectorAll("[data-demo-action]").forEach((button) => button.addEventListener("click", () => {
    const [name, amount] = button.dataset.demoAction.split("|");
    basket.push({ name, amount: Number(amount) });
    const lines = demoWorkspace.querySelector(".basket-lines");
    const total = demoWorkspace.querySelector(".basket-total");
    if (lines) lines.innerHTML = basket.map((item) => `<p><span>${item.name}</span><strong>£${item.amount.toFixed(2)}</strong></p>`).join("");
    if (total) total.textContent = `£${basket.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}`;
  }));
  demoWorkspace.querySelector("[data-clear-basket]")?.addEventListener("click", () => renderDemo("hospitality"));
  demoWorkspace.querySelector("[data-pay]")?.addEventListener("click", () => {
    const status = demoWorkspace.querySelector(".payment-status");
    if (!basket.length) { if (status) status.textContent = "Add a product first."; return; }
    if (status) status.textContent = "Test payment approved. Receipt ready.";
    basket = [];
  });
}

function openProjectView(viewName) {
  const project = projects[activeProjectName];
  if (project?.realDemo && project.showcase) {
    const showcaseUrl = new URL(window.location.hostname === "localhost" ? project.showcase.local : project.showcase.production);
    const destination = project.moduleRoutes?.[viewName];
    if (destination) showcaseUrl.searchParams.set("next", destination);
    window.open(showcaseUrl.toString(), "_blank", "noopener,noreferrer");
    return;
  }
  renderDemo(viewName);
  demoModal.showModal();
}

menuButton?.addEventListener("click", () => {
  const open = mainNavigation.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(open));
});
mainNavigation?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNavigation));
document.addEventListener("click", (event) => {
  if (mainNavigation?.classList.contains("is-open") &&
      !mainNavigation.contains(event.target) &&
      !menuButton?.contains(event.target)) closeMobileNavigation();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileNavigation();
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 980) closeMobileNavigation();
});
document.querySelectorAll("[data-project-select]").forEach((button) => button.addEventListener("click", () => renderProject(button.dataset.projectSelect)));
projectLaunch?.addEventListener("click", () => openProjectView(projectLaunch.dataset.projectView));
projectModuleList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-module]");
  if (button) openProjectView(button.dataset.projectModule);
});
demoButtons.forEach((button) => button.addEventListener("click", () => renderDemo(button.dataset.demoView)));
document.querySelector(".close-demo")?.addEventListener("click", () => demoModal.close());
demoModal?.addEventListener("click", (event) => { if (event.target === demoModal) demoModal.close(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && demoModal?.open) demoModal.close(); });

const initialProject = new URLSearchParams(window.location.search).get("project");
renderProject(projects[initialProject] ? initialProject : "ocean");

const aquaCrmLoginOrigin = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3032"
  : "https://aqua-crm.com";
document.querySelectorAll("[data-aquacrm-login]").forEach((link) => {
  link.href = `${aquaCrmLoginOrigin}/login?brand=aquacrm&next=/portal`;
});
