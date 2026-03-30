import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import Module from '../models/Module.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SUMMARY_PROMPT = 'Summarize this study material into bullet points. Highlight key concepts clearly.';
const QUIZ_PROMPT = 'Generate board-exam style MCQs from the core concepts only (ignore headers, footers, page labels, metadata). Use one-best-answer format with realistic vignettes, high-quality distractors, and no giveaway wording. Include a balanced mix of easy, medium, and hard cognitive levels. Return JSON only in this structure: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0}]}';

// Strip noisy PDF headers/footers and repeated lines.
const stripPdfNoise = (raw) => {
  if (!raw) return '';

  // Normalize common unicode spaces and line endings
  const text = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const lines = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  // Count repeated lines (typical for headers/footers across pages)
  const freq = new Map();
  for (const l of lines) freq.set(l, (freq.get(l) || 0) + 1);

  const isPageMarker = (l) =>
    /^page\s*\d+(\s*of\s*\d+)?$/i.test(l) ||
    /^\d+\s*\/\s*\d+$/i.test(l) ||
    /^-\s*\d+\s*-$/.test(l) ||
    /^\d+$/.test(l);

  const looksLikeFooterHeader = (l) =>
    /(confidential|property of|all rights reserved|copyright|©|page \d+|header|footer|student\s*name|course|section|name:|id:)/i.test(l);

  const cleaned = lines.filter((l) => {
    // Drop obvious markers
    if (isPageMarker(l)) return false;

    // Drop repeated short-ish lines (likely headers/footers)
    const count = freq.get(l) || 0;
    if (count >= 3 && l.length <= 90) return false;

    // Drop very short header/footer-like lines
    if (l.length <= 25 && looksLikeFooterHeader(l)) return false;

    // Drop lines that are mostly separators
    if (/^[\W_]{3,}$/.test(l)) return false;

    return true;
  });

  return cleaned.join('\n').trim();
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'those', 'these',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'for', 'by', 'with',
  'at', 'from', 'as', 'it', 'its', 'their', 'there', 'about', 'into', 'over', 'under', 'through'
]);

const normalizeForCompare = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanSentenceText = (s) => {
  let out = String(s || '').replace(/\s+/g, ' ').trim();
  // Remove leading bullets/symbols
  out = out.replace(/^[•*\-–—\d\)\(.\s]+/, '');
  // Remove uppercase heading fragments before proper sentence content
  out = out.replace(/^([A-Z][A-Z\s,&()/\-]{8,})\s+(The|This|It|An|A)\b/, '$2');
  // Drop obvious header/footer leftovers
  out = out.replace(/\b(page\s*\d+(\s*of\s*\d+)?|all rights reserved|confidential|property of)\b/gi, '').trim();
  return out;
};

const sentenceParts = (text) =>
  (text.match(/[^.!?]+[.!?]+/g) || [])
    .map(s => cleanSentenceText(s))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 45 && s.length <= 220);

const toCompleteSentence = (input) => {
  const s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return /[.!?]$/.test(s) ? s : `${s}.`;
};

const shortenAtWordBoundary = (text, max = 140) => {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${safe}.`;
};

const uniqueBy = (arr, selector) => {
  const seen = new Set();
  return arr.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractKeywords = (sentence) =>
  normalizeForCompare(sentence)
    .split(' ')
    .filter(w => w.length > 3 && !STOPWORDS.has(w));

const getTopicPhrase = (sentence) => {
  const words = extractKeywords(sentence);
  if (words.length === 0) return 'this concept';
  return words.slice(0, 3).join(' ');
};

const optionFromSentence = (sentence) => {
  const s = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(sentence)), 135);
  return s.startsWith('•') ? s.slice(1).trim() : s;
};

const pickDistractors = (target, pool, count = 3) => {
  const tKeywords = new Set(extractKeywords(target));
  const scored = pool
    .filter(s => normalizeForCompare(s) !== normalizeForCompare(target))
    .map((s) => {
      const kws = extractKeywords(s);
      const overlap = kws.filter(k => tKeywords.has(k)).length;
      const lengthGap = Math.abs(s.length - target.length);
      // Prefer some topical overlap but not too close to avoid duplicates.
      const score = overlap * 5 - Math.min(lengthGap, 120) / 20;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.s);

  return uniqueBy(scored, s => normalizeForCompare(s)).slice(0, count);
};

const buildWrongOptions = (correct) => {
  const generic = [
    'It overgeneralizes the concept beyond the material scope.',
    'It reverses the causal direction implied in the material.',
    'It confuses a related term with the main concept.',
    'It applies the concept to a context not supported by the text.'
  ];
  return generic.filter(opt => opt.toLowerCase() !== correct.toLowerCase()).slice(0, 3);
};

const shuffleOptions = (options, correctIndex = 0) => {
  const tagged = options.map((o, i) => ({ o, i }));
  for (let i = tagged.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return {
    options: tagged.map(x => x.o),
    correctAnswer: tagged.findIndex(x => x.i === correctIndex)
  };
};

const buildExamQuestion = (sentence, difficulty, idx, pool) => {
  const correct = optionFromSentence(sentence);
  const distractorsRaw = pickDistractors(sentence, pool, 3);
  if (distractorsRaw.length < 3) return null;
  const distractors = distractorsRaw.map(optionFromSentence);
  const { options, correctAnswer } = shuffleOptions([correct, ...distractors], 0);
  const topic = getTopicPhrase(sentence);

  const easyStems = [
    `According to the module, which statement is correct about ${topic}?`,
    `Which statement best matches the module's explanation of ${topic}?`,
    `Which option is explicitly supported by the module regarding ${topic}?`
  ];
  const mediumStems = [
    `Which inference is most consistent with the module's discussion of ${topic}?`,
    `Based on the module, which interpretation of ${topic} is strongest?`,
    `Which conclusion about ${topic} is best supported by the text?`
  ];
  const hardStems = [
    `A trainee must decide how to apply ${topic} in a real situation. Which option is the single best answer based on the module?`,
    `When applying ${topic} to a practical case, which option is most defensible using the module content?`,
    `Which choice shows the strongest applied judgment on ${topic} based on the module evidence?`
  ];

  const stem = difficulty === 'easy'
    ? easyStems[idx % easyStems.length]
    : difficulty === 'medium'
      ? mediumStems[idx % mediumStems.length]
      : hardStems[idx % hardStems.length];

  return {
    question: stem,
    options,
    correctAnswer,
    difficulty,
    type: 'mcq',
    explanation: `The best answer is supported by the module statement: ${correct}`
  };
};

// Generate difficulty-specific, exam-style questions
const generateMultipleChoiceQuestions = (text) => {
  const cleanText = stripPdfNoise(text)
    .replace(/^[^\n]*(?:Property of|STI|student|confidential|©).*$/gim, '')
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|proprietary|page \d+).*/gim, '')
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[*_-]{3,}\s*$/gm, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  const sentences = uniqueBy(sentenceParts(cleanText), (s) => s.toLowerCase());
  if (sentences.length === 0) return [];

  const easyPool = [];
  const mediumPool = [];
  const hardPool = [];

  sentences.forEach((s, i) => {
    const wc = s.split(/\s+/).length;
    if (wc <= 18) easyPool.push(s);
    else if (wc <= 32) mediumPool.push(s);
    else hardPool.push(s);
  });

  const backfill = [...sentences];
  const fill = (arr, min) => {
    for (let i = 0; arr.length < min && i < backfill.length; i += 1) arr.push(backfill[i]);
  };
  fill(easyPool, 8);
  fill(mediumPool, 8);
  fill(hardPool, 8);

  const easyQs = uniqueBy(easyPool, (s) => s.toLowerCase())
    .slice(0, 8)
    .map((s, i) => buildExamQuestion(s, 'easy', i, sentences))
    .filter(Boolean);
  const mediumQs = uniqueBy(mediumPool, (s) => s.toLowerCase())
    .slice(0, 8)
    .map((s, i) => buildExamQuestion(s, 'medium', i, sentences))
    .filter(Boolean);
  const hardQs = uniqueBy(hardPool, (s) => s.toLowerCase())
    .slice(0, 8)
    .map((s, i) => buildExamQuestion(s, 'hard', i, sentences))
    .filter(Boolean);

  return [...easyQs, ...mediumQs, ...hardQs];
};

const buildStudyFlashcards = (text, keyConcepts = []) => {
  const cards = [];
  const cleaned = stripPdfNoise(text);
  const sentences = sentenceParts(cleaned);

  keyConcepts
    .slice(0, 8)
    .forEach((concept, index) => {
      const [title, detail] = String(concept).split(/:\s+(.+)/);
      cards.push({
        front: title?.trim() || concept,
        back: detail?.trim() || `Explain why ${concept} matters in the context of this module.`,
        difficulty: index < 3 ? 'easy' : index < 6 ? 'medium' : 'hard'
      });
    });

  sentences.slice(0, 10).forEach((sentence, index) => {
    if (cards.length >= 12) return;
    const topic = getTopicPhrase(sentence);
    cards.push({
      front: `What should you remember about ${topic}?`,
      back: shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(sentence)), 180),
      difficulty: index < 3 ? 'easy' : index < 6 ? 'medium' : 'hard'
    });
  });

  return uniqueBy(cards, (card) => normalizeForCompare(`${card.front} ${card.back}`)).slice(0, 12);
};

const detectExtractionWarning = (cleanedText, pageCount = 0) => {
  if (!cleanedText || cleanedText.length < 180) {
    return 'Text extraction looks weak. Review the generated notes before studying.';
  }

  if (pageCount >= 3 && cleanedText.length / pageCount < 220) {
    return 'Some pages may not have extracted cleanly. Review the PDF preview and summary for accuracy.';
  }

  return '';
};

// Generate case-based situational legal exam questions
const generateCaseBasedQuestions = () => {
  const legalCases = [
    {
      scenario: 'ABC Construction agrees to build a residential complex for XYZ Developer by December 15. On December 10, an earthquake destroyed 60% of the construction materials at the site. ABC claims they cannot continue due to the fortuitous event.',
      topic: 'Fortuitous Events & Obligations',
      questions: [
        {
          question: 'What is the legal consequence of the earthquake on ABC\'s obligation to deliver the project?',
          options: [
            'ABC is exempt from liability if the earthquake is deemed a fortuitous event beyond their control',
            'ABC must still pay damages to XYZ because earthquakes are foreseeable in the region',
            'ABC is obligated to rebuild using their own funds regardless of the damage',
            'XYZ must provide insurance coverage for all fortuitous events'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'Under the law of obligations, when ABC claims force majeure due to the earthquake, which element must they prove?',
          options: [
            'That the event could not have been foreseen or prevented despite reasonable efforts',
            'That the contract price was too low to account for such risks',
            'That they had not received payment from XYZ yet',
            'That the earthquake caused less than 50% damage to the site'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'MNO Bank loaned ₱500,000 to three business partners (Juan, Pedro, and Luis) for their venture. The contract states they are "solidarily liable" for the loan.',
      topic: 'Solidary vs Joint Liability',
      questions: [
        {
          question: 'What does solidary liability mean in this contractual context, and what is MNO Bank\'s right?',
          options: [
            'MNO Bank can demand full payment from any one of the three partners, and that partner is liable for the entire ₱500,000',
            'MNO Bank must divide the debt equally and can only demand ₱166,666.67 from each partner',
            'MNO Bank can only sue all three partners together in one case',
            'MNO Bank has no claim against individual partners, only against the partnership entity'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'If Juan pays the entire ₱500,000 to MNO Bank, what are his legal rights against Pedro and Luis?',
          options: [
            'Juan can demand reimbursement from Pedro and Luis for their share of the debt (recovery/subrogation)',
            'Juan cannot recover anything because he voluntarily assumed all liability',
            'Juan can only recover from the one who benefited most from the loan',
            'Juan must wait for MNO Bank to sue Pedro and Luis first'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Fashion Boutique contracted with Textile Supplier to deliver 1,000 meters of premium fabric on March 1. Textile Supplier delayed delivery until March 15. Fashion Boutique lost sales worth ₱50,000 due to the delay and now faces bankruptcy.',
      topic: 'Delay & Breach of Obligation',
      questions: [
        {
          question: 'Under the law of obligations, what is the status of Textile Supplier\'s obligation after March 1?',
          options: [
            'The obligation is in "mora" (delay), and Textile Supplier is liable for damages caused by the delay',
            'The obligation is automatically extinguished because the deadline passed',
            'Textile Supplier can decide whether to fulfill the obligation or pay damages',
            'Fashion Boutique waives all rights upon accepting the late delivery'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'What damages can Fashion Boutique claim from Textile Supplier for the 14-day delay?',
          options: [
            'Actual damages (lost sales of ₱50,000) and moral damages if applicable, and the cost of finding alternative suppliers',
            'Only the difference in market price of the fabric between March 1 and March 15',
            'Unlimited damages for all business losses extending one year from the delay',
            'No damages because partial performance was eventually made'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Real Estate Developer promised to deliver a condominium unit to Buyer by June 30. Two construction workers died in an accident on the site, investigations halted construction for 60 days, and the developer could not meet the deadline.',
      topic: 'Fortuitous Events & Breach',
      questions: [
        {
          question: 'Is the developer\'s failure to deliver by June 30 a breach of obligation or excused by fortuitous event?',
          options: [
            'It depends on whether the accident was foreseeable and whether proper safety measures were in place; if proper precautions were taken, it may be excused',
            'It is automatically a breach regardless of the accident',
            'It is automatically excused because accidents are fortuitous events',
            'The developer must compensate heirs but still deliver the unit immediately'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'If the developer claims the accident is a fortuitous event, what must they demonstrate to be exempt from liability?',
          options: [
            'That (1) the event was extraordinary and unforeseeable, (2) they exercised due diligence, and (3) the event directly prevented performance',
            'That they have adequate insurance coverage',
            'That the accident occurred within the project timeline originally estimated',
            'That the buyer was informed before the deadline passed'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Employment Contract: Company XYZ employed Engineer Maria with a salary of ₱100,000/month for 3 years. After 18 months, XYZ terminated Maria without just cause or notice. Maria demands payment of remaining salary plus damages.',
      topic: 'Extinguishment of Obligations & Breach',
      questions: [
        {
          question: 'How is the employment obligation extinguished when XYZ terminated Maria without just cause?',
          options: [
            'The obligation is extinguished but XYZ remains liable for damages; Maria can claim the remaining salary (₱150,000) and moral damages',
            'The obligation is completely extinguished upon termination',
            'The obligation converts to a debt requiring arbitration',
            'Maria loses all rights since the contract was already partially performed'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'Under the doctrine of extinguishment of obligations, which apply to this case?',
          options: [
            'Payment (partial), breach by the obligor (XYZ), and damages as a new obligation for compensation',
            'Only payment, as that is the sole method of extinguishing obligations',
            'Condonation, if Maria forgives XYZ',
            'Prescription, after a certain period of non-payment'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    }
  ];

  const selectedCases = [];
  const usedIndices = new Set();

  // Randomly select 2-3 cases for diverse scenarios
  while (selectedCases.length < Math.min(3, legalCases.length) && usedIndices.size < legalCases.length) {
    const idx = Math.floor(Math.random() * legalCases.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selectedCases.push(legalCases[idx]);
    }
  }

  const questions = [];
  selectedCases.forEach(caseData => {
    caseData.questions.forEach(q => {
      questions.push({
        ...q,
        caseScenario: caseData.scenario,
        topic: caseData.topic
      });
    });
  });

  return questions.slice(0, 8);
};

// Fallback quiz generation without OpenAI - Focused on academic content only
const generateFallbackQuiz = (text) => {
  // Detect if this is legal content about obligations, contracts, liability, etc.
  const legalKeywords = /\b(obligation|contract|liability|breach|delay|mora|fortuitous|solidary|joint|liability|damages|extinguish|condonation|prescription|debtor|creditor|performance|non-performance|delay|default|force majeure)\b/gi;
  const legalMatches = text.match(legalKeywords) || [];
  
  // If content contains legal keywords (more than 3 matches), use case-based questions
  if (legalMatches.length >= 3) {
    const caseBasedQuestions = generateCaseBasedQuestions();
    if (caseBasedQuestions.length > 0) {
      return caseBasedQuestions;
    }
  }

  // Clean text: Remove headers, footers, page numbers, emails, disclaimers
  let cleanText = stripPdfNoise(text)
    // Remove document headers/footers with watermarks
    .replace(/^[^\n]*(?:Property of|STI|student|confidential|©).*$/gim, '')
    // Remove page numbers (standalone numbers at start/end of lines)
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    // Remove copyright and disclaimer lines
    .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|proprietary|page \d+).*/gim, '')
    // Remove email addresses
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove lines with special characters only (like section separators)
    .replace(/^\s*[*_-]{3,}\s*$/gm, '')
    // Remove excessive whitespace
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  // Extract meaningful sentences (academic content)
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];
  
  // Filter for academic sentences (longer, substantive content)
  const academicSentences = sentences
    .map((s) => s.trim())
    .filter((s) => {
      // Keep sentences with meaningful length and academic indicators
      const length = s.length;
      // Exclude lines that look like metadata or formatting garbage
      const isGarbage = /^[A-Z0-9\s]*$/.test(s) || // All caps/numbers
                       /[*_-]{2,}/.test(s) || // Lots of special chars
                       /^\d+$/.test(s) || // Just numbers
                       /box|figure|table|page|header|footer/i.test(s); // Formatting words
      
      const hasAcademicWords = /\b(is|are|was|been|concept|define|explain|understand|theory|principle|law|method|process|function|occurs|result|affect|importance|significance|role|key|important|essential|therefore|because|cause|effect|example)\b/i.test(s);
      const notHeader = !/^(chapter|section|unit|part|lesson|page|header|title|figure|table|note|learning|objective)/i.test(s);
      
      return length > 35 && length < 250 && !isGarbage && (hasAcademicWords || length > 100) && notHeader;
    })
    .slice(0, 25);

  // Extract key academic terms (capitalized words, multi-word terms)
  const words = cleanText.toLowerCase().split(/\s+/);
  const commonWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'and', 'or', 'of', 'in', 'at', 'to', 'for', 'by', 'with', 'on', 'as',
    'from', 'it', 'that', 'this', 'which', 'who', 'what', 'where', 'when', 'why',
    'how', 'but', 'such', 'their', 'there', 'these', 'than', 'then', 'no', 'if'
  ]);

  // Get key academic terms (proper nouns, technical terms)
  const keyTerms = [...new Set(
    text.split(/\s+/)
      .filter(w => {
        const lower = w.toLowerCase();
        return w.length > 4 
          && !commonWords.has(lower) 
          && (w[0] === w[0].toUpperCase() || /[A-Z]/.test(w))
          && !/[^\w-]/.test(w); // No special characters
      })
      .slice(0, 25)
  )];

  const questions = [];

  // Generate questions from academic sentences
  academicSentences.forEach((sentence, idx) => {
    if (questions.length >= 8) return;

    const cleanSentence = sentence.replace(/[.!?]/g, '').trim();
    
    if (cleanSentence.length > 35 && cleanSentence.length < 230) {
      // Question type 1: Comprehension question (80+ chars)
      if (idx % 2 === 0) {
        questions.push({
          question: `Based on the material: ${cleanSentence.substring(0, 140)}...?`,
          options: [
            'The statement above is correct',
            'The statement is a common misconception',
            'The statement is only partially accurate',
            'The material does not address this'
          ],
          correctAnswer: 0,
          difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
        });
      }
      
      // Question type 2: Multiple choice definition
      if (questions.length < 8 && idx % 3 !== 0 && cleanSentence.length > 50) {
        const conceptMatch = cleanSentence.match(/(?:is|are|means|involves|refers|includes|implies)\s+([^,.]+)/i);
        const concept = conceptMatch ? conceptMatch[1].trim().substring(0, 80) : cleanSentence.substring(0, 80);
        
        questions.push({
          question: `What does the material suggest about: ${cleanSentence.substring(0, 100)}?`,
          options: [
            concept,
            'An unrelated concept from another field',
            'A theory that has been disproven',
            'Information not included in the material'
          ],
          correctAnswer: 0,
          difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
        });
      }
    }
  });

  // Fill remaining slots with additional comprehension questions
  while (questions.length < 8 && academicSentences.length > 0) {
    const randomIdx = Math.floor(Math.random() * (academicSentences.length - questions.length));
    const sentence = academicSentences[randomIdx];
    const cleanSentence = sentence.replace(/[.!?]/g, '').trim();
    
    if (cleanSentence.length > 40 && cleanSentence.length < 250) {
      questions.push({
        question: `According to the material: "${cleanSentence.substring(0, 130)}..."`,
        options: [
          'This is accurate',
          'This is incorrect',
          'This is only partially true',
          'The material does not mention this'
        ],
        correctAnswer: 0,
        difficulty: questions.length % 3 === 0 ? 'easy' : questions.length % 3 === 1 ? 'medium' : 'hard'
      });
    }
  }

  return questions.slice(0, 8);
};

const processWithAI = async (text) => {
  if (!openai) {
    console.warn('⚠️ OpenAI API key not configured - generating quiz using local method');
    const cleaned = stripPdfNoise(text);
    // Use new difficulty-specific question generation
    const quizQuestions = generateMultipleChoiceQuestions(cleaned);
    
    // Extract academic summary (ignore disclaimers, headers, etc.)
    const cleanedForSummary = cleaned
      .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|page \d+).*/gim, '')
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '');
    
    const summary = cleanedForSummary
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !/^(chapter|section|unit|page|header)/i.test(s))
      .slice(0, 5)
      .join('. ') + '.';
    
    // Extract key academic concepts
    const keyConcepts = cleaned
      .split(/\s+/)
      .filter(w => w.length > 5 && w[0] === w[0].toUpperCase() && /^[A-Za-z-]+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i) // Remove duplicates
      .slice(0, 8);
    
    const conceptDetails = keyConcepts.map((concept) => {
      const supportingSentence = sentenceParts(cleaned).find((sentence) =>
        normalizeForCompare(sentence).includes(normalizeForCompare(concept))
      );
      const detail = supportingSentence
        ? shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(supportingSentence)), 180)
        : `Review how ${concept} is explained in the uploaded module.`;
      return `${concept}: ${detail}`;
    });

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards: buildStudyFlashcards(cleaned, conceptDetails),
      quizQuestions,
      aiAvailable: false
    };
  }
  try {
    console.log('📚 Starting AI processing for text...');
    const cleaned = stripPdfNoise(text);
    
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${cleaned.slice(0, 4000)}` }]
    });
    const summary = summaryResponse.choices[0].message.content;
    console.log('✅ Summary generated');

    const quizResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${QUIZ_PROMPT}\n\n${cleaned.slice(0, 4000)}` }]
    });

    let quizData;
    try {
      const content = quizResponse.choices[0].message.content;
      // Try to extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ Could not find JSON in quiz response');
        quizData = { questions: [] };
      } else {
        quizData = JSON.parse(jsonMatch[0]);
        console.log(`✅ Quiz generated with ${quizData.questions?.length || 0} questions`);
        
        // Assign difficulty levels to AI-generated questions (distribute evenly)
        quizData.questions = (quizData.questions || []).map((q, idx) => ({
          ...q,
          difficulty: idx < Math.floor(quizData.questions.length / 3) ? 'easy' : 
                     idx < Math.floor(2 * quizData.questions.length / 3) ? 'medium' : 'hard',
          type: 'mcq'
        }));
      }
    } catch (parseErr) {
      console.error('❌ Error parsing quiz JSON:', parseErr.message);
      quizData = { questions: [] };
    }

    const keyConcepts = summary
      .split(/[•\n]/)
      .filter(line => line.trim())
      .slice(0, 5)
      .map(line => line.replace(/^[\d\.\-\s]+/, '').trim())
      .filter(Boolean);

    const conceptDetails = keyConcepts.map((concept) => `${concept}: Focus on how this idea is developed in the uploaded module.`);

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards: buildStudyFlashcards(cleaned, conceptDetails),
      quizQuestions: quizData.questions || [],
      aiAvailable: true
    };
  } catch (err) {
    console.error('❌ AI Processing Error:', err.message);
    console.log('📚 Falling back to local quiz generation...');
    // Use new difficulty-specific generation
    const cleaned = stripPdfNoise(text);
    const quizQuestions = generateMultipleChoiceQuestions(cleaned);
    
    // Extract academic summary using the same rules
    const cleanedForSummary = cleaned
      .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|page \d+).*/gim, '')
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '');
    
    const summary = cleanedForSummary
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !/^(chapter|section|unit|page|header)/i.test(s))
      .slice(0, 5)
      .join('. ') + '.';
    
    // Extract key academic concepts
    const keyConcepts = cleaned
      .split(/\s+/)
      .filter(w => w.length > 5 && w[0] === w[0].toUpperCase() && /^[A-Za-z-]+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i) // Remove duplicates
      .slice(0, 8);
    
    const conceptDetails = keyConcepts.map((concept) => `${concept}: Review this concept directly in the uploaded material.`);

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards: buildStudyFlashcards(cleaned, conceptDetails),
      quizQuestions,
      aiAvailable: false,
      error: err.message
    };
  }
};

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { title } = req.body;
    let text = '';
    let pdfData = '';
    let fileType = '';
    let fileSize = 0;
    let pageCount = 0;

    if (req.file) {
      const isPdfUpload = req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname || '');
      fileType = isPdfUpload ? 'application/pdf' : req.file.mimetype;
      fileSize = req.file.size;

      if (isPdfUpload) {
        const parsedPdf = await pdfParse(req.file.buffer);
        text = parsedPdf.text;
        pageCount = parsedPdf.numpages || 0;
        pdfData = req.file.buffer.toString('base64');
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ message: 'No content provided' });
    }

    // Clean PDF noise early so everything downstream uses the important content.
    const cleanedText = stripPdfNoise(text);
    const aiResult = await processWithAI(cleanedText);
    const extractionWarning = detectExtractionWarning(cleanedText, pageCount);

    const module = new Module({
      userId: req.user.id,
      title: title || 'Untitled Module',
      originalText: cleanedText,
      pdfData,
      fileType,
      fileSize,
      pageCount,
      extractionWarning,
      summary: aiResult.summary,
      keyConcepts: aiResult.keyConcepts,
      flashcards: aiResult.flashcards,
      quizQuestions: aiResult.quizQuestions,
      fileName: req.file?.originalname
    });

    await module.save();
    
    // Return response with indication of whether AI was available
    const response = module.toObject();
    if (!aiResult.aiAvailable) {
      response.warning = '⚠️ OpenAI API not configured. Summary and quiz questions not generated. Add OPENAI_API_KEY to .env to enable AI features.';
    }
    if (aiResult.quizQuestions.length === 0 && aiResult.aiAvailable) {
      response.warning = '⚠️ Could not generate quiz questions. The module was saved but quiz generation failed.';
    }
    
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const modules = await Module.find({ userId: req.user.id })
      .select('-pdfData')
      .sort({ createdAt: -1 });
    res.json(modules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    res.json(module);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/file', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id }).select('title fileName fileType pdfData');
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (module.fileType !== 'application/pdf' || !module.pdfData) {
      return res.status(404).json({ message: 'PDF file not available for this module' });
    }

    const fileBuffer = Buffer.from(module.pdfData, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${module.fileName || `${module.title}.pdf`}"`);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/quiz', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const { answers, difficulty } = req.body;
    
    // Filter questions by selected difficulty
    const allQuestions = module.quizQuestions || [];
    const filteredQuestions = difficulty 
      ? allQuestions.filter(q => q.difficulty === difficulty)
      : allQuestions;

    if (filteredQuestions.length === 0) {
      return res.status(400).json({ message: 'No questions available for selected difficulty' });
    }

    // Calculate score based on filtered questions
    const results = answers.map((answer, index) => ({
      questionIndex: index,
      selectedAnswer: answer,
      correct: filteredQuestions[index]?.correctAnswer === answer,
      difficulty: difficulty
    }));

    const score = results.filter(r => r.correct).length;
    const totalQuestions = filteredQuestions.length;

    // Mark used questions
    const usedIndices = module.usedQuestionIndices || [];
    filteredQuestions.forEach((q, idx) => {
      const fullIndex = allQuestions.indexOf(q);
      if (fullIndex !== -1 && !usedIndices.includes(fullIndex)) {
        usedIndices.push(fullIndex);
      }
    });
    module.usedQuestionIndices = usedIndices;
    await module.save();

    const attempt = new QuizAttempt({
      userId: req.user.id,
      moduleId: module._id,
      score,
      totalQuestions,
      answers: results,
      difficulty: difficulty
    });

    await attempt.save();
    res.json({ score, totalQuestions, results, filteredQuestions, difficulty });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Regenerate quiz for a module
router.post('/:id/regenerate-quiz', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (!module.originalText) {
      return res.status(400).json({ message: 'No original content to generate quiz from' });
    }

    const aiResult = await processWithAI(module.originalText);
    
    module.summary = aiResult.summary;
    module.keyConcepts = aiResult.keyConcepts;
    module.flashcards = aiResult.flashcards;
    module.quizQuestions = aiResult.quizQuestions;
    module.usedQuestionIndices = []; // Reset used questions
    
    await module.save();
    
    const response = module.toObject();
    response.message = `Quiz regenerated with ${aiResult.quizQuestions.length} questions (${aiResult.quizQuestions.filter(q => q.difficulty === 'easy').length} easy, ${aiResult.quizQuestions.filter(q => q.difficulty === 'medium').length} medium, ${aiResult.quizQuestions.filter(q => q.difficulty === 'hard').length} hard)`;
    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get quiz history for a specific module
router.get('/:id/quiz-history', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const attempts = await QuizAttempt.find({ moduleId: req.params.id, userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get quiz statistics for a specific module
router.get('/:id/quiz-stats', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const attempts = await QuizAttempt.find({ moduleId: req.params.id, userId: req.user.id })
      .lean();

    if (attempts.length === 0) {
      return res.json({
        totalAttempts: 0,
        bestScore: null,
        averageScore: null,
        successRate: null,
        mostMissedQuestions: []
      });
    }

    const scores = attempts.map(a => a.score);
    const bestScore = Math.max(...scores);
    const averageScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const successRate = (attempts.filter(a => a.score / a.totalQuestions >= 0.6).length / attempts.length * 100).toFixed(1);

    // Track which questions are most frequently missed
    const missedQuestions = {};
    attempts.forEach(attempt => {
      attempt.answers.forEach(answer => {
        if (!answer.correct) {
          missedQuestions[answer.questionIndex] = (missedQuestions[answer.questionIndex] || 0) + 1;
        }
      });
    });

    const mostMissedQuestions = Object.entries(missedQuestions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([index, count]) => ({
        questionIndex: parseInt(index),
        question: module.quizQuestions?.[index]?.question || 'Unknown',
        missCount: count
      }));

    res.json({
      totalAttempts: attempts.length,
      bestScore: `${bestScore}/${attempts[0].totalQuestions}`,
      averageScore: `${averageScore}/${attempts[0].totalQuestions}`,
      successRate: `${successRate}%`,
      mostMissedQuestions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a module
router.delete('/:id', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    // Delete all quiz attempts for this module
    await QuizAttempt.deleteMany({ moduleId: req.params.id, userId: req.user.id });

    // Delete the module
    await Module.deleteOne({ _id: req.params.id, userId: req.user.id });

    res.json({ message: 'Module deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
