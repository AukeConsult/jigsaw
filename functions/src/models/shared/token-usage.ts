/** The subcollection of a user (`jigsaw-users/<id>/token-usage`) where what the AI used for the user is kept, one document for each call, so it can be paid for later. */
export const JIGSAW_TOKEN_USAGE = 'token-usage';

/** What one call to an AI service used, as the service says it. */
export interface AiUsage {
  provider: 'openai';
  /** the model that was asked for (from the settings) */
  model: string;
  /** the model that answered, as the service says it (it can be a dated version of `model`) */
  responseModel?: string;
  /** the id the service gave the call (to find it in its own records) */
  requestId?: string;
  /** the tokens that were sent (the text and the picture) */
  inputTokens: number;
  /** the tokens that came back */
  outputTokens: number;
  totalTokens: number;
  /** of the input tokens, those that were cheaper because they were cached */
  cachedInputTokens?: number;
  /** of the output tokens, those spent on reasoning */
  reasoningTokens?: number;
  /** how closely the picture was looked at (low, high or auto): it changes how many tokens a picture is */
  imageDetail?: string;
}

/** What the AI was used for. */
export type TokenUsageKind = 'classify' | 'translate';

/** One call that is kept for a user: what it used and what it was for. */
export interface TokenUsageSpec extends AiUsage {
  id: string;
  /** the UID of the user the call is for (who pays for it) */
  userId: string;
  kind: TokenUsageKind;
  /** the jigsaw it was about */
  jigsawId?: string;
  /** the tile of the home page it was about (a translation) */
  feedId?: string;
  /** `ok`: it gave an answer that could be used; `failed`: the tokens were spent, but there was nothing to use */
  status: 'ok' | 'failed';
  /** the answer was put on the jigsaw */
  applied: boolean;
  /** when the call was made (milliseconds since 1970) and the same as a text, so a person can read it in the database */
  createdAt: number;
  date: string;
  /** it has been paid for (false until a payment takes it in) */
  billed: boolean;
}

/** The rules of what is kept of the AI's use. */
export class TokenUsages {
  /**
   * What an OpenAI answer says it used (`usage` of a Chat Completions answer), with the model and the closeness of the look that were asked for. undefined when the answer says
   * nothing about it (then there is nothing to keep).
   */
  static fromOpenAi(body: unknown, asked: { model: string; imageDetail?: string }): AiUsage | undefined {
    const b = body as {
      id?: unknown;
      model?: unknown;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; prompt_tokens_details?: unknown; completion_tokens_details?: unknown };
    } | null;
    const u = b?.usage;
    if (!u || typeof u !== 'object') return undefined;
    const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
    const inputTokens = count(u.prompt_tokens);
    const outputTokens = count(u.completion_tokens);
    const cached = count((u.prompt_tokens_details as { cached_tokens?: unknown } | undefined)?.cached_tokens);
    const reasoning = count((u.completion_tokens_details as { reasoning_tokens?: unknown } | undefined)?.reasoning_tokens);
    return {
      provider: 'openai',
      model: asked.model,
      ...(typeof b?.model === 'string' && b.model ? { responseModel: b.model } : {}),
      ...(typeof b?.id === 'string' && b.id ? { requestId: b.id } : {}),
      inputTokens,
      outputTokens,
      totalTokens: count(u.total_tokens) || inputTokens + outputTokens,
      ...(cached ? { cachedInputTokens: cached } : {}),
      ...(reasoning ? { reasoningTokens: reasoning } : {}),
      ...(asked.imageDetail ? { imageDetail: asked.imageDetail } : {}),
    };
  }

  /** A call as it is kept for a user (nothing but the known fields; not yet paid for). */
  static record(usage: AiUsage, about: { userId: string; kind: TokenUsageKind; jigsawId?: string; feedId?: string; status: 'ok' | 'failed'; applied: boolean; now: number }): Omit<TokenUsageSpec, 'id'> {
    return {
      userId: about.userId,
      kind: about.kind,
      ...(about.jigsawId ? { jigsawId: about.jigsawId } : {}),
      ...(about.feedId ? { feedId: about.feedId } : {}),
      status: about.status,
      applied: about.applied,
      createdAt: about.now,
      date: new Date(about.now).toISOString(),
      billed: false,
      provider: usage.provider,
      model: usage.model,
      ...(usage.responseModel ? { responseModel: usage.responseModel } : {}),
      ...(usage.requestId ? { requestId: usage.requestId } : {}),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      ...(usage.cachedInputTokens ? { cachedInputTokens: usage.cachedInputTokens } : {}),
      ...(usage.reasoningTokens ? { reasoningTokens: usage.reasoningTokens } : {}),
      ...(usage.imageDetail ? { imageDetail: usage.imageDetail } : {}),
    };
  }

  /** What a list of calls adds up to, and how much of it is not yet paid for. */
  static totals(list: readonly TokenUsageSpec[]): { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; unbilledTokens: number } {
    const sum = (pick: (u: TokenUsageSpec) => number) => list.reduce((n, u) => n + pick(u), 0);
    return {
      calls: list.length,
      inputTokens: sum((u) => u.inputTokens),
      outputTokens: sum((u) => u.outputTokens),
      totalTokens: sum((u) => u.totalTokens),
      unbilledTokens: sum((u) => (u.billed ? 0 : u.totalTokens)),
    };
  }
}
