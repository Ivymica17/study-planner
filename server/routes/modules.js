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
const QUIZ_PROMPT = 'Generate 5 multiple choice questions with 4 choices each and indicate the correct answer. Return JSON format with this structure: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0}]}';

// Generate difficulty-specific questions (Easy, Medium, Hard pools)
const generateMultipleChoiceQuestions = (text) => {
  // Clean text
  let cleanText = text
    .replace(/^[^\n]*(?:Property of|STI|student|confidential|©).*$/gim, '')
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|proprietary|page \d+).*/gim, '')
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[*_-]{3,}\s*$/gm, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];
  
  // Categorize sentences by complexity
  const simpleSentences = [], mediumSentences = [], complexSentences = [];
  
  sentences.forEach(s => {
    const cleaned = s.replace(/[.!?]/g, '').trim();
    const length = cleaned.length;
    const wordCount = cleaned.split(/\s+/).length;
    const commas = (cleaned.match(/,/g) || []).length;
    
    // Simple: shorter, fewer clauses (Easy difficulty)
    if (length > 40 && length < 120 && wordCount < 20) {
      simpleSentences.push(cleaned);
    }
    // Medium: moderate length, some complexity
    else if (length >= 120 && length < 200 && wordCount >= 20 && wordCount < 40 && commas < 3) {
      mediumSentences.push(cleaned);
    }
    // Complex: longer, more clauses (Hard difficulty)
    else if (length >= 200 && length < 300 && wordCount > 40 && commas >= 2) {
      complexSentences.push(cleaned);
    }
  });

  const allQuestions = [];

  // EASY QUESTIONS - Straightforward comprehension
  simpleSentences.slice(0, 6).forEach((sent, idx) => {
    allQuestions.push({
      question: `What does the material state about: "${sent.substring(0, 80)}..."?`,
      options: [
        `"${sent.substring(0, 60)}..." is accurate`,
        'This contradicts the material',
        'The material does not address this',
        'This is a common misconception'
      ],
      correctAnswer: 0,
      difficulty: 'easy',
      type: 'mcq'
    });
    
    if (allQuestions.filter(q => q.difficulty === 'easy').length < 8) {
      allQuestions.push({
        question: `True or False: "${sent.substring(0, 90)}"?`,
        options: ['True', 'False'],
        correctAnswer: 0,
        difficulty: 'easy',
        type: 'trueFalse'
      });
    }
  });

  // MEDIUM QUESTIONS - Interpretation and analysis
  mediumSentences.slice(0, 6).forEach((sent, idx) => {
    const terms = sent.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    const mainTerm = terms[0] || 'the concept';
    
    allQuestions.push({
      question: `Based on the material, what is implied about ${mainTerm}?`,
      options: [
        `${sent.substring(0, 70)}...`,
        'The opposite of what the material suggests',
        'Something unrelated to the main topic',
        'Information not found in the material'
      ],
      correctAnswer: 0,
      difficulty: 'medium',
      type: 'mcq'
    });
    
    if (allQuestions.filter(q => q.difficulty === 'medium').length < 8) {
      allQuestions.push({
        question: `Can you infer from the material: "${sent.substring(0, 85)}"?`,
        options: ['Yes', 'No'],
        correctAnswer: 0,
        difficulty: 'medium',
        type: 'trueFalse'
      });
    }
  });

  // HARD QUESTIONS - Synthesis and critical thinking
  complexSentences.slice(0, 6).forEach((sent, idx) => {
    allQuestions.push({
      question: `Analyze: Which statement best captures the material's position on: "${sent.substring(0, 100)}"?`,
      options: [
        `The material emphasizes: "${sent.substring(0, 75)}"...`,
        'The material contradicts this interpretation',
        'This requires outside knowledge not in the material',
        'All of the above perspectives are equally supported'
      ],
      correctAnswer: 0,
      difficulty: 'hard',
      type: 'mcq'
    });
    
    if (allQuestions.filter(q => q.difficulty === 'hard').length < 8) {
      allQuestions.push({
        question: `Critically evaluate: "${sent.substring(0, 90)}"?`,
        options: ['Substantiated', 'Debatable'],
        correctAnswer: 0,
        difficulty: 'hard',
        type: 'trueFalse'
      });
    }
  });

  // Ensure we have at least 8 questions per difficulty
  const easyQs = allQuestions.filter(q => q.difficulty === 'easy').slice(0, 8);
  const mediumQs = allQuestions.filter(q => q.difficulty === 'medium').slice(0, 8);
  const hardQs = allQuestions.filter(q => q.difficulty === 'hard').slice(0, 8);

  // Combine all questions (8 per difficulty = 24 total)
  return [...easyQs, ...mediumQs, ...hardQs];
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
  let cleanText = text
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
    // Use new difficulty-specific question generation
    const quizQuestions = generateMultipleChoiceQuestions(text);
    
    // Extract academic summary (ignore disclaimers, headers, etc.)
    const cleanedForSummary = text
      .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|page \d+).*/gim, '')
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '');
    
    const summary = cleanedForSummary
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !/^(chapter|section|unit|page|header)/i.test(s))
      .slice(0, 5)
      .join('. ') + '.';
    
    // Extract key academic concepts
    const keyConcepts = text
      .split(/\s+/)
      .filter(w => w.length > 5 && w[0] === w[0].toUpperCase() && /^[A-Za-z-]+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i) // Remove duplicates
      .slice(0, 8);
    
    return { summary, keyConcepts, quizQuestions, aiAvailable: false };
  }
  try {
    console.log('📚 Starting AI processing for text...');
    
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.slice(0, 4000)}` }]
    });
    const summary = summaryResponse.choices[0].message.content;
    console.log('✅ Summary generated');

    const quizResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${QUIZ_PROMPT}\n\n${text.slice(0, 4000)}` }]
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

    return { summary, keyConcepts, quizQuestions: quizData.questions || [], aiAvailable: true };
  } catch (err) {
    console.error('❌ AI Processing Error:', err.message);
    console.log('📚 Falling back to local quiz generation...');
    // Use new difficulty-specific generation
    const quizQuestions = generateMultipleChoiceQuestions(text);
    
    // Extract academic summary using the same rules
    const cleanedForSummary = text
      .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|page \d+).*/gim, '')
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '');
    
    const summary = cleanedForSummary
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !/^(chapter|section|unit|page|header)/i.test(s))
      .slice(0, 5)
      .join('. ') + '.';
    
    // Extract key academic concepts
    const keyConcepts = text
      .split(/\s+/)
      .filter(w => w.length > 5 && w[0] === w[0].toUpperCase() && /^[A-Za-z-]+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i) // Remove duplicates
      .slice(0, 8);
    
    return { summary, keyConcepts, quizQuestions, aiAvailable: false, error: err.message };
  }
};

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { title } = req.body;
    let text = '';

    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(req.file.buffer);
        text = pdfData.text;
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ message: 'No content provided' });
    }

    const aiResult = await processWithAI(text);

    const module = new Module({
      userId: req.user.id,
      title: title || 'Untitled Module',
      originalText: text,
      summary: aiResult.summary,
      keyConcepts: aiResult.keyConcepts,
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
    const modules = await Module.find({ userId: req.user.id }).sort({ createdAt: -1 });
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
