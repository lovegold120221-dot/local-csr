import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const KNOWLEDGE_DIR = '/Users/eburon/Documents/my-knowledge';

interface Document {
  content: string;
  similarity: number;
  uuid: string;
}

async function loadDocuments(): Promise<Document[]> {
  const documents: Document[] = [];

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    return documents;
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR);

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    
    if (file.endsWith('.md') || file.endsWith('.txt')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      documents.push({
        content,
        similarity: 1,
        uuid: file,
      });
    } else if (file.endsWith('.json')) {
      try {
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const textContent = jsonToSearchableText(jsonData);
        documents.push({
          content: textContent,
          similarity: 1,
          uuid: file,
        });
      } catch (e) {
        console.error(`Error parsing JSON file ${file}:`, e);
      }
    }
  }

  return documents;
}

function jsonToSearchableText(obj: unknown, prefix = ''): string {
  if (obj === null || obj === undefined) return '';
  
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return `${prefix}${obj}`;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => jsonToSearchableText(item, prefix)).join(' ');
  }
  
  if (typeof obj === 'object') {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      parts.push(jsonToSearchableText(value, `${key}: `));
    }
    return parts.join('. ');
  }
  
  return '';
}

function calculateSimilarity(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  let matches = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }

  return matches / queryWords.length;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message || message.type !== 'knowledge-base-request') {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
    }

    const messages = message.messages || [];
    const userMessages = messages.filter((m: { role: string }) => m.role === 'user');
    const latestQuery = userMessages[userMessages.length - 1]?.content || '';

    const documents = await loadDocuments();

    if (documents.length === 0) {
      return NextResponse.json({ documents: [] });
    }

    const scoredDocs = documents.map((doc) => ({
      ...doc,
      similarity: calculateSimilarity(latestQuery, doc.content),
    }));

    const relevantDocs = scoredDocs
      .filter((doc) => doc.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return NextResponse.json({
      documents: relevantDocs.map((doc) => ({
        content: doc.content,
        similarity: doc.similarity,
        uuid: doc.uuid,
      })),
    });
  } catch (error) {
    console.error('Knowledge base search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
