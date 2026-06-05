import axios from 'axios';
import { config } from '../config.js';
import { ServerMetrics } from '../types/index.js';

export class OpenClawService {
  private static getHeaders(sessionId: string) {
    return {
      'Authorization': `Bearer ${config.openclawToken}`,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': `discord-${sessionId}`,
    };
  }

  /**
   * Send a chat message to OpenClaw.
   * Keeps track of the session and automatically injects the login sequence on the first message.
   */
  static async chat(
    sessionId: string,
    email: string,
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  ): Promise<string> {
    const url = `${config.openclawApiUrl}/v1/chat/completions`;

    const messages = [...history];
    if (messages.length === 0) {
      // First message in conversation: prepend login instruction
      messages.push({
        role: 'user',
        content: `First, run the login tool with my email: ${email}. Once logged in, answer my query: "${userMessage}"`
      });
    } else {
      messages.push({
        role: 'user',
        content: userMessage
      });
    }

    try {
      const response = await axios.post(
        url,
        {
          model: 'openclaw/default',
          messages,
        },
        {
          headers: this.getHeaders(sessionId),
          timeout: 45000, // LLMs and multiple tool calls can take time
        }
      );

      const botReply = response.data?.choices?.[0]?.message?.content || '';
      return botReply;
    } catch (error: any) {
      console.error('[OpenClaw] Chat Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  /**
   * Helper to execute a direct command by generating a targeted prompt.
   * e.g. for slash commands /cpu, /memory
   */
  static async executeDirectCommand(
    sessionId: string,
    email: string,
    prompt: string
  ): Promise<string> {
    const url = `${config.openclawApiUrl}/v1/chat/completions`;
    const messages = [
      {
        role: 'user',
        content: `First, run the login tool with email ${email}. Then, run the requested action: "${prompt}". Respond with the raw tool output formatted as a clean, easy-to-read markdown table or bullet points.`
      }
    ];

    try {
      const response = await axios.post(
        url,
        {
          model: 'openclaw/default',
          messages,
        },
        {
          headers: this.getHeaders(sessionId),
          timeout: 45000,
        }
      );

      return response.data?.choices?.[0]?.message?.content || 'No response from AI.';
    } catch (error: any) {
      console.error(`[OpenClaw] Command Execution Error (${prompt}):`, error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  /**
   * Fetch all system metrics from MCP through OpenClaw in a structured JSON schema.
   */
  static async getMetrics(email: string): Promise<ServerMetrics> {
    const url = `${config.openclawApiUrl}/v1/chat/completions`;
    
    // We request a new session 'alert-checker-loop' each time or reuse it to keep it authenticated
    const sessionId = 'alert-checker-loop';
    
    const prompt = `First, run the login tool with email ${email}. Then run the tools get_cpu_usage, get_memory_usage, get_disk_usage, get_docker_containers, get_postgres_status, get_rabbitmq_status, get_nginx_status, and get_cloudflared_status. 
Respond ONLY with a valid JSON object matching this schema: 
{ 
  "cpu": { "usagePercent": number, "loadAverage1Min": number }, 
  "memory": { "usagePercent": number }, 
  "disk": { "usagePercent": number }, 
  "postgres": { "status": "OK" | "ERROR", "error": string }, 
  "rabbitmq": { "status": "OK" | "ERROR", "error": string }, 
  "cloudflared": { "status": "OK" | "ERROR", "error": string }, 
  "docker": { "unhealthyContainersCount": number, "containers": Array<{ "name": string, "status": string, "healthy": boolean }> }, 
  "nginx": { "status": "OK" | "ERROR", "error": string } 
}`;

    try {
      const response = await axios.post(
        url,
        {
          model: 'openclaw/default',
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: this.getHeaders(sessionId),
          timeout: 90000, // Checking all 8 tools can take up to 90 seconds
        }
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      return this.extractJson<ServerMetrics>(content);
    } catch (error: any) {
      console.error('[OpenClaw] Metrics Fetch Error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch server metrics: ${error.message}`);
    }
  }

  private static extractJson<T>(text: string): T {
    // Look for JSON block wrapped in triple backticks or plain JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Invalid response format from AI: no JSON block found. Content: ${text}`);
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch (err: any) {
      throw new Error(`Failed to parse JSON content from AI: ${err.message}. Raw: ${match[0]}`);
    }
  }
}
