export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { messages, pageData, currentTab } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages' });
    }

    const systemPrompt = buildSystemPrompt(pageData, currentTab);

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return res.status(500).json({ error: 'OpenAI error', details: errText.substring(0, 300) });
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';
    return res.status(200).json({ reply, usage: data.usage });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

function buildSystemPrompt(pageData, currentTab) {
  const tabLabels = {
    gspn: 'GSPN Tracking Cases',
    sky: 'SKY Tracking Cases',
    profit: 'Profitability & Commission',
    cashTarget: 'Cash & Target'
  };
  const tabLabel = tabLabels[currentTab] || currentTab || 'Unknown';

  let prompt = `You are a data analyst assistant integrated into the Service Eye Manager dashboard.
You help users analyze and understand their service center operations.

IMPORTANT CONTEXT:
- The user is currently viewing the "${tabLabel}" tab
- Data is loaded directly from GitHub Excel files (always fresh)
- You can analyze the FULL DATASET, not just visible rows
- Always respond in the SAME LANGUAGE the user used (Arabic or English)
- Be concise, direct, and data-driven
- Format numbers clearly (use commas for thousands, percentages where useful)
- When showing top/bottom lists, prefer markdown tables or clear bullet lists
- If a metric isn't in the provided data, say so — never invent numbers
- For analytical questions, provide insights and recommendations when relevant
`;

  if (pageData && pageData.summary) {
    const s = pageData.summary;
    prompt += `\n\n=== CURRENT TAB DATA ===\n`;
    prompt += `Tab: ${tabLabel}\n`;
    prompt += `Total rows in dataset: ${s.totalRows || 0}\n`;
    
    if (s.isFiltered) {
      prompt += `Currently filtered/visible rows: ${s.filteredRows}\n`;
      prompt += `Note: User has filters applied. You see the FULL dataset.\n`;
    }

    if (s.kpis && Object.keys(s.kpis).length) {
      prompt += `\nKey metrics (from full dataset):\n`;
      for (const [key, value] of Object.entries(s.kpis)) {
        prompt += `- ${key}: ${typeof value === 'number' ? value.toLocaleString() : value}\n`;
      }
    }

    if (s.breakdowns && Object.keys(s.breakdowns).length) {
      prompt += `\nBreakdowns (top values per category):\n`;
      for (const [category, items] of Object.entries(s.breakdowns)) {
        prompt += `\n${category}:\n`;
        for (const [name, count] of Object.entries(items)) {
          prompt += `  - ${name}: ${count}\n`;
        }
      }
    }

    if (s.activeFilters && s.activeFilters.note) {
      prompt += `\nFilter info: ${s.activeFilters.note}\n`;
    }

    if (s.sampleRows && s.sampleRows.length) {
      prompt += `\nSample rows (${s.sampleRows.length} of ${s.totalRows}):\n`;
      prompt += JSON.stringify(s.sampleRows, null, 2).substring(0, 8000);
    }

    prompt += `\n\n=== END OF DATA ===\n`;
  } else {
    prompt += `\n\nNote: No data is loaded yet. If the user asks about specific data, suggest they wait a moment for the page to load it from GitHub, or refresh the page.`;
  }

  return prompt;
}
