export interface PortfolioChunk {
	id: string;
	text: string;
	category: string;
	title: string;
}

// Replace these chunks with your actual portfolio content.
// Each chunk will be embedded and stored in Vectorize.
// Keep chunks focused on a single topic for better retrieval quality.
export const portfolioData: PortfolioChunk[] = [
	{
		id: "about-1",
		category: "about",
		title: "About Me",
		text: "I am a full-stack software engineer with experience building modern web applications. I am passionate about creating clean, performant, and user-friendly software. I enjoy working across the stack, from designing APIs to crafting polished UIs.",
	},
	{
		id: "skills-frontend",
		category: "skills",
		title: "Frontend Skills",
		text: "Frontend skills: React, TypeScript, Next.js, Tailwind CSS, HTML, CSS. I build responsive and accessible user interfaces with a focus on performance and user experience.",
	},
	{
		id: "skills-backend",
		category: "skills",
		title: "Backend Skills",
		text: "Backend skills: Node.js, Express, REST APIs, GraphQL, PostgreSQL, MongoDB, Redis. I design and implement scalable server-side systems and databases.",
	},
	{
		id: "skills-cloud",
		category: "skills",
		title: "Cloud & DevOps Skills",
		text: "Cloud and DevOps: Cloudflare Workers, AWS, Docker, GitHub Actions, CI/CD pipelines. I deploy and manage cloud-native applications with automated workflows.",
	},
	{
		id: "project-1",
		category: "projects",
		title: "Project: Portfolio Website",
		text: "Portfolio website built with React and TypeScript, deployed on Cloudflare Pages. Features an AI-powered chat assistant that uses Gemini Embedding for semantic search across portfolio content.",
	},
	{
		id: "project-2",
		category: "projects",
		title: "Project 2",
		text: "Replace this with a description of your second project. Include the tech stack, what problem it solves, and any notable achievements.",
	},
	{
		id: "project-3",
		category: "projects",
		title: "Project 3",
		text: "Replace this with a description of your third project. Include the tech stack, what problem it solves, and any notable achievements.",
	},
	{
		id: "experience-1",
		category: "experience",
		title: "Work Experience",
		text: "Replace this with your work experience. Include your job title, company, duration, and key responsibilities or achievements.",
	},
	{
		id: "education-1",
		category: "education",
		title: "Education",
		text: "Replace this with your education background. Include your degree, institution, graduation year, and any relevant coursework or achievements.",
	},
	{
		id: "contact-1",
		category: "contact",
		title: "Contact Information",
		text: "You can reach me via email or connect with me on LinkedIn and GitHub. Replace this with your actual contact details and social links.",
	},
];
