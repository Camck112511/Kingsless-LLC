import { PUBLIC_PHONE } from "./phone";

/**
 * All public-site copy lives here. Edit freely: this is the file to change when the wording needs to change.
 * Nothing on the site claims credentials, clients, or results that are not true; keep it that way.
 */
export const site = {
  name: "Kingsless LLC",
  tagline: "One accountable partner. Vetted specialists. Work delivered as promised.",
  description:
    "Kingsless LLC manages projects and procurement end to end: we scope the work, line up vetted specialist partners, and stay accountable for the result.",
  // Public contact email. Set NEXT_PUBLIC_CONTACT_EMAIL in the hosting dashboard to override it.
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Cullenmckinney@kingsless.org",
  // The number itself is in content/phone.ts (or the CONTACT_PHONE variable) and is never rendered into a page:
  // visitors get it only when they press the Phone button. The button is shown when a number is configured.
  hasPhone: Boolean(process.env.CONTACT_PHONE?.trim() || PUBLIC_PHONE),
  nav: [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ],
  hero: {
    eyebrow: "Project and procurement management",
    title: "One accountable partner for work that needs specialists.",
    body:
      "Kingsless LLC defines the scope, qualifies the specialist companies who perform the work, and manages delivery, so you deal with one accountable partner instead of many.",
    primary: { href: "/contact", label: "Contact us" },
    secondary: { href: "/services", label: "Our services" },
  },
  /** The three-step picture shown beside the hero headline. */
  engagement: [
    { tag: "You", title: "Your requirements", body: "The work, the location, the timeline and any constraints." },
    { tag: "Kingsless", title: "Scope, firm price, accountability", body: "One written scope and price. We stay responsible for the result." },
    { tag: "Partners", title: "Vetted specialists", body: "Licensed, insured, referenced and confirmed available." },
  ],
  pillars: [
    {
      icon: "scope",
      title: "Scoped before it starts",
      body: "We write down what is included, what is not, and what done looks like, so there are no surprises on price or schedule.",
    },
    {
      icon: "shield",
      title: "Specialists, vetted",
      body: "Partners are checked for the right licenses, insurance, and relevant experience before they touch your job.",
    },
    {
      icon: "handshake",
      title: "Accountable to you",
      body: "We stay on the hook for quality and delivery. If something slips, you call us, not a chain of subcontractors.",
    },
  ],
  steps: [
    { title: "Understand the need", body: "We review your requirements, timeline, and constraints." },
    { title: "Define the scope", body: "A clear scope of work and a firm price, in writing." },
    { title: "Assemble the team", body: "Qualified, insured specialists matched to the job." },
    { title: "Manage delivery", body: "We coordinate the work, check quality, and keep you informed." },
  ],
  services: [
    {
      icon: "project",
      title: "Project management",
      body: "End-to-end coordination of multi-party work: scheduling, partner management, quality checks, and reporting.",
      points: ["Scope-of-work development", "Partner coordination", "Progress reporting"],
    },
    {
      icon: "document",
      title: "Procurement support",
      body: "Help responding to and managing public and private solicitations with clear, compliant proposals.",
      points: ["Solicitation review", "Compliance checklists", "Bid and quote preparation"],
    },
    {
      icon: "check",
      title: "Partner vetting",
      body: "A repeatable process for confirming that a company can actually do the job before it is hired.",
      points: ["License and insurance verification", "Reference checks", "Capacity and pricing confirmation"],
    },
  ],
  standards: {
    title: "How we qualify the companies we work with",
    body: "A company appearing in a directory is not proof it can do the job. Before a partner is engaged, we confirm each of these:",
    items: [
      "Required licenses, checked with the issuing authority",
      "Insurance certificates on file, at the limits the work requires",
      "Relevant completed projects, with references we can call",
      "Capacity and availability for your dates",
      "A firm written price for your exact scope",
      "Agreement to work under a written subcontract",
    ],
  },
  contact: {
    title: "Tell us what you need done",
    body: "Send a short description of the work, where it is, and when you need it. We will reply with questions or a scope and price.",
  },
};
