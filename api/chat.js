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
        max_tokens: 1500
      })
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return res.status(500).json({ error: 'OpenAI error', details: errText.substring(0, 200) });
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

  let prompt = `You are a helpful assistant integrated into the Service Eye Manager dashboard.
You help users understand and analyze their service center data.

IMPORTANT CONTEXT:
- The user is currently viewing the "${tabLabel}" tab
- You can ONLY answer questions about the data shown in the current tab
- If the user asks about a different tab, politely tell them to switch to that tab first
- Always respond in the SAME LANGUAGE the user used (Arabic or English)
- Be concise and direct
- When showing numbers, format them clearly (use commas for thousands)
- If you're unsure about something, say so — don't make up numbers
`;

  if (pageData && pageData.summary) {
    prompt += `\n\n=== CURRENT TAB DATA SUMMARY ===\nTab: ${tabLabel}\nTotal rows: ${pageData.summary.totalRows || 0}\n`;

    if (pageData.summary.kpis) {
      prompt += `\nKey metrics:\n`;
      for (const [key, value] of Object.entries(pageData.summary.kpis)) {
        prompt += `- ${key}: ${value}\n`;
      }
    }

    if (pageData.summary.breakdowns) {
      prompt += `\nBreakdowns:\n`;
      for (const [category, items] of Object.entries(pageData.summary.breakdowns)) {
        prompt += `\n${category}:\n`;
        for (const [name, count] of Object.entries(items)) {
          prompt += `  - ${name}: ${count}\n`;
        }
      }
    }

    if (pageData.summary.sampleRows && pageData.summary.sampleRows.length) {
      prompt += `\nSample of recent rows:\n${JSON.stringify(pageData.summary.sampleRows, null, 2)}`;
    }

    prompt += `\n=== END OF DATA ===\n`;
  } else {
    prompt += `\n\nNote: No data is currently loaded. Ask the user to load data first.`;
  }

  return prompt;
}
