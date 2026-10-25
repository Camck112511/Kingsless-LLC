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
  // The phone number is NOT in this repo or in the page. Set CONTACT_PHONE (server-side) in the hosting dashboard;
  // visitors get it only when they press the Phone button. The button shows only when it is set.
  hasPhone: Boolean(process.env.CONTACT_PHONE?.trim()),
  nav: [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ],
  hero: {
    eyebrow: "Project and procurement management",
    title: "You get one point of contact. We bring the right specialists.",
    body:
      "Kingsless LLC takes responsibility for getting a job done. We define the scope, qualify the specialist companies who will perform the work, and manage delivery so you deal with one accountable partner instead of many.",
    primary: { href: "/contact", label: "Start a conversation" },
    secondary: { href: "/services", label: "See how we work" },
  },
  pillars: [
    {
      title: "Scoped before it starts",
      body: "We write down what is included, what is not, and what done looks like, so there are no surprises on price or schedule.",
    },
    {
      title: "Specialists, vetted",
      body: "Partners are checked for the right licenses, insurance, and relevant experience before they touch your job.",
    },
    {
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
      title: "Project management",
      body: "End-to-end coordination of multi-party work: scheduling, partner management, quality checks, and reporting.",
      points: ["Scope-of-work development", "Partner coordination", "Progress reporting"],
    },
    {
      title: "Procurement support",
      body: "Help responding to and managing public and private solicitations with clear, compliant proposals.",
      points: ["Solicitation review", "Compliance checklists", "Bid and quote preparation"],
    },
    {
      title: "Partner vetting",
      body: "A repeatable process for confirming that a company can actually do the job before it is hired.",
      points: ["License and insurance verification", "Reference checks", "Capacity and pricing confirmation"],
    },
  ],
  contact: {
    title: "Tell us what you need done",
    body: "Send a short description of the work, where it is, and when you need it. We will reply with questions or a scope and price.",
  },
};
