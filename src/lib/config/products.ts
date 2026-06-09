import { Product } from "@/lib/types";

export const products: Product[] = [
  { id: "depthprofile", name: "DepthProfile", url: "https://depthprofile.com", checkInterval: 15, expectedStatus: 200, category: "saas" },
  { id: "prd-generator", name: "PRD Generator", url: "https://prd-generator-inky-ten.vercel.app", checkInterval: 15, expectedStatus: 200, category: "tool" },
  { id: "speed-to-lead", name: "Speed to Lead", url: "https://speed-to-lead-jade.vercel.app", checkInterval: 15, expectedStatus: 200, category: "agent" },
  { id: "missed-call-textback", name: "Missed Call Textback", url: "https://missed-call-textback.vercel.app", checkInterval: 15, expectedStatus: 200, category: "agent" },
  { id: "meeting-recap-agent", name: "Meeting Recap Agent", url: "https://meeting-recap-agent.vercel.app", checkInterval: 15, expectedStatus: 200, category: "agent" },
  { id: "dead-db-reactivation", name: "Dead DB Reactivation", url: "https://dead-db-reactivation.vercel.app", checkInterval: 15, expectedStatus: 200, category: "agent" },
  { id: "eduagent", name: "EduAgent", url: "https://eduagent-app.vercel.app", checkInterval: 15, expectedStatus: 200, category: "agent" },
  { id: "byterover", name: "ByteRover", url: "https://byterover-eight.vercel.app", checkInterval: 15, expectedStatus: 200, category: "saas" },
  { id: "openclaw", name: "OpenClaw", url: "https://openclaw-two-xi.vercel.app", checkInterval: 15, expectedStatus: 200, category: "saas" },
  { id: "clawdbot-saas", name: "Clawdbot SaaS", url: "https://clawdbot-saas-pi.vercel.app", checkInterval: 15, expectedStatus: 200, category: "saas" },
  { id: "feedbackwidget", name: "Feedback Widget", url: "https://feedbackwidget-xi.vercel.app", checkInterval: 15, expectedStatus: 200, category: "tool" },
];

export const productMap = new Map(products.map((p) => [p.id, p]));
