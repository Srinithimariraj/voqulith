# VOQULITH

Built in Lovable in August 2026. Code exported to GitHub in November 2026 for version control and ongoing improvements.

Build a professional SaaS web application called VOICE OF COPILOT.

PURPOSE: An AI-powered customer feedback intelligence platform for Product Managers. It converts feedback from multiple sources into actionable product insights.

DESIGN: Create a premium, modern SaaS dashboard with a clean white background, dark navy text, subtle purple and blue accents, professional typography, rounded cards and responsive layouts.

PAGES: Dashboard with total feedback, pain points, themes, churn risks and sentiment charts. Data Upload supporting CSV, Excel where supported, text files, customer screenshots and manual feedback, with source selection. AI Analysis for sentiment, pain points, theme clustering, real customer quotes, churn signals, severity, frequency and recommendations. Theme Clustering with counts, percentages, sentiment, severity and original quotes. Churn Detection for cancellation intent, uninstall intent, repeated unresolved complaints and refund frustration, with evidence and risk level. Product Roadmap with recommendation, problem, evidence, affected customers, business impact, P0/P1/P2 priority and next action. Customer Quotes with original statements, source and feedback ID.

AI: Connect a real AI model through a secure backend using Gemini API. Never expose API keys in frontend code. Return structured JSON. Include executive summary, sentiment distribution, pain point clusters, customer quotes with IDs, churn signals with IDs, roadmap recommendations, confidence and evidence.

DATA RULES: Never fabricate feedback or quotes. Link every insight to original feedback. Label assumptions and uncertainty. Avoid counting duplicate feedback as independent customers.

DEMO: Include clearly labeled synthetic Zomato sample data. All buttons and uploads must work. The Analyze button must trigger real AI analysis, not static fake results. Include loading and error states. Build a working MVP, not just a landing page.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/11128904-633f-5a07-958e-5aac6543f6eb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
