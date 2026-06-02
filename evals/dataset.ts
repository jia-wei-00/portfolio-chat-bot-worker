/**
 * Ground-truth Q&A pairs for retrieval evals.
 *
 * expected_keywords: at least one must appear (case-insensitive) in the
 * retrieved chunks for the question to count as a "hit".
 *
 * Update these with accurate answers from your actual portfolio content
 * after running the first eval pass.
 */
export interface EvalCase {
  question: string;
  expected_keywords: string[];
  category: string;
}

export const dataset: EvalCase[] = [
  {
    question: "What is Jia Wei's current job title and company?",
    expected_keywords: ["TNG Digital", "Specialist", "Front-End"],
    category: "experience",
  },
  {
    question: "What front-end frameworks and libraries does Jia Wei use?",
    expected_keywords: ["React", "Vue", "Angular", "TypeScript"],
    category: "skills",
  },
  {
    question: "What programming languages does Jia Wei know?",
    expected_keywords: ["TypeScript", "JavaScript", "Python"],
    category: "skills",
  },
  {
    question: "What is the portfolio chat bot project about?",
    expected_keywords: ["chat", "AI", "portfolio", "RAG"],
    category: "projects",
  },
  {
    question: "Where did Jia Wei study and what did he study?",
    expected_keywords: ["university", "degree", "bachelor", "computer"],
    category: "education",
  },
  {
    question: "How can I contact Jia Wei?",
    expected_keywords: ["email", "linkedin", "github", "contact", "@"],
    category: "contact",
  },
  {
    question: "What is Jia Wei's GitHub profile?",
    expected_keywords: ["github.com", "jia-wei", "jiawei"],
    category: "contact",
  },
  {
    question: "What are Jia Wei's recent projects?",
    expected_keywords: ["portfolio", "jia-wei", "project"],
    category: "projects",
  },
  {
    question: "Tell me about Jia Wei's work experience history",
    expected_keywords: ["TNG", "developer", "engineer", "worked", "years"],
    category: "experience",
  },
];
