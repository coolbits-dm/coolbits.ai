Enhancements to CoolBits.ai Chat Frontend
1. Real-Time Model–Agent Confirmation

To ensure the selected AI model and agent are ready before sending a prompt, we introduce a lightweight handshake between the frontend and backend. Whenever the user selects a different agent or model, the frontend will:

Send a status request: Call a new endpoint POST /api/session/agent-status with { agentId, modelId, workspaceId } in the body. For example, if the user picks agent CTO with model Claude 3.5 in workspace Business, the payload might be:

{ "agentId": "cbAgent-B-002-cto", "modelId": "claude-3.5", "workspaceId": "business" }


The backend (statusRouter.js) will quickly check whether the model is loaded/available and the agent profile is active, then return a JSON response like:

{ "status": "ready", "latency": 120, "modelConfirmed": true, "agentConfirmed": true }


Here status: "ready" indicates the backend is prepared, with a measured latency of 120ms for the handshake. In case of issues, status might be "error" and the modelConfirmed/agentConfirmed flags can signal which part failed (e.g., model not loaded or agent offline).

Update UI indicators: In the chat composer UI (e.g. in composer.js), display a real-time connection status. We’ll add a small status line (or icon) that shows “Model connected: Claude 3.5 | Agent: CTO” when ready. A green LED or checkmark icon can indicate both model and agent are confirmed ✅. During the handshake (before the backend responds), show a spinner or grey dot next to “Connecting…”, and disable the Send button to prevent sending messages prematurely
github.com
. Once the response comes back with "ready", enable the Send button and update the text to the connected model/agent. If the backend replies with an error or doesn’t respond within a timeout, the UI will show a warning (e.g. a red icon with “Failed to connect”) and keep the Send button disabled until the user reselects or the status becomes ready.

Non-blocking design: The handshake call is asynchronous and will not freeze the UI. The user can continue typing their prompt while the status is being verified. If the status check fails (e.g. network error or backend unavailable), the system will gracefully fallback to default behavior – for example, hide the status indicator and allow sending anyway after a short delay, rather than completely blocking the chat. This ensures the feature doesn’t break the app if the new endpoint is down. (In development, we can use mock data for the status response until the real backend is ready.)

Active agent tooltip: We’ll also enhance clarity by showing an “Active Agent” tooltip or info on hover. The agent label (e.g. “CTO”) can have a tooltip like “Active agent: Chief Technology Officer (CTO)” or the agent’s name if available. This is helpful in a multi-agent (“council”) scenario to identify which agent is currently active. For example, if agent Elena (COO) is active, hovering the agent name could show “Active agent: Elena – Chief Operating Officer”. This uses the agent’s profile info (name/title) for better UX.

Under the hood, the changes involve modifying chat.js or the relevant component handling model/agent selection to trigger the fetch, and updating composer.js to reflect the status. The backend needs a new route in statusRouter.js to handle /api/session/agent-status – for now this can return a dummy { status:"ready", ... } but it should eventually perform actual checks (e.g. ping the model or verify the agent config).

2. Token Usage Awareness & Cost Preview

We aim to give users immediate feedback on how large their prompt is (in tokens) and what it might cost, before they hit Send. This involves:

Live token estimation: As the user types in the composer, we dynamically estimate the token count of the prompt. We can approximate 1 token ≈ 4 characters on average (OpenAI’s models typically tokenize roughly four characters per token)
hrdag.org
. For a more precise estimate, we could have a per-model multiplier (e.g. some models like Claude might use slightly different tokenization). For simplicity, we will use a static ratio or a lightweight tokenizer if available. For example, if the user has typed 700 characters, we estimate ~175 tokens. This calculation updates in real-time with each keystroke (handled in composer.js on the text area’s input event).

Cost calculation using pricing data: We will load a price matrix for models (either a real one from pricing.config.json or a mock for now). This config maps each model to its cost per token or per 1000 tokens. For instance, if using OpenAI’s pricing, GPT-4 might cost about $0.03 per 1K input tokens (and $0.06/1K for output), whereas GPT-3.5 Turbo is about $0.002 per 1K tokens
hrdag.org
. We will use the input token rate for the prompt cost. The app can pre-load something like:

{
  "gpt-4":    { "input_per_1000": 0.03, "currency": "USD" },
  "gpt-3.5":  { "input_per_1000": 0.002, "currency": "USD" },
  "claude-3.5": { "input_per_1000": 0.02, "currency": "USD" },
  ... 
}


(These numbers are examples; the real config would have exact prices for each model/provider.) Using this, if our estimated tokens = 175 and the selected model is GPT-4 at $0.03/1K, the estimated cost is 175/1000 * $0.03 ≈ $0.0053. We’ll format and display it in the user’s currency (the example UI uses €, so presumably we convert USD to EUR or the config is in EUR). In this example it might show as “€0.005”, which might be rounded to “€0.01” or displayed as “€0.00” if rounding to two decimals. The prompt in the spec showed €0.03 for 175 tokens, which suggests either a higher rate or just a placeholder. We will ensure the math uses the actual price from config.

UI display in composer: We’ll add a small text line in the composer (likely just below the input box). This line will read something like:

“Prompt length: 700 chars | Estimated tokens: 175 | Estimated cost: €0.03”

It updates continuously as the user types or pastes text. If the user switches models, the cost recalculates based on the new model’s rate. This gives instant feedback about how much this prompt will consume.

Warnings for large prompts: To prevent unintended large submissions, we introduce thresholds:

If the prompt exceeds ~250 tokens, we will highlight the token/cost text in yellow or show a ⚠️ icon to caution the user. This is a gentle warning that the prompt is quite lengthy. (250 tokens is an arbitrary threshold for “large”; it’s roughly a few paragraphs of text.)

If the prompt exceeds ~500 tokens, we take a stronger action: when the user hits Send, we require an explicit confirmation. For example, on clicking Send, a modal or window.confirm dialog will say “Your prompt is ~600 tokens (~2× larger than average). This will be slower and cost more to process. Do you want to send it?” The user must confirm to proceed. This acts as a hard checkpoint to avoid accidentally sending extremely long queries. The 500-token threshold is a safeguard for both cost and model limitations (since very long prompts approach model context limits and incur higher latency). This two-tier warning approach (caution at 250, confirmation at 500) is in line with common UX practices of tiered usage alerts (e.g. warnings at 80% usage, then hard stop at 100%)
kinde.com
.

Implementation details: In composer.js, we will implement an updateTokenEstimate() function that runs on input change. This function counts the characters (e.g. let chars = inputText.length), converts to token estimate (tokens = Math.ceil(chars / 4) or using a small library if available), then looks up the model’s pricing. We might keep a JavaScript object of prices loaded from pricing.config.json at app start. The cost is then cost = (tokens/1000) * pricePer1000 for that model. We format the number to a couple of decimal places. The values are then injected into the composer’s DOM, perhaps in a span or small <div> below the text area. We will also apply CSS classes for warning states: e.g. if tokens > 250, add a class that colors the text amber; if >500, maybe color it red or bold. The Send button’s click handler (in chat.js) will check the token count; if >500, trigger a confirm dialog (and only actually send if the user agrees). These checks ensure the user is aware of large requests and their costs before they incur them.

By providing this live token and cost info, users can make informed decisions and edit their queries to fit their budget. It increases transparency in the app about how the input size translates to token usage and money spent
hrdag.org
.

3. Contextual Payload Injection

Each prompt will automatically include structured context metadata about the conversation’s setting, so the AI has the necessary background. We achieve this by injecting a context object into every payload in payloadBuilder.js. The context contains:

{
  "workspace": "Business",
  "agentId": "cbAgent-B-004-coo",
  "agentName": "Elena",
  "model": "Claude 3.5",
  "role": "COO",
  "council": ["CEO", "CMO", "COO", "CTO"]
}


This example shows a user in the “Business” workspace, using agent Elena who is the COO, with an executive council of four roles (CEO, CMO, COO, CTO) available. In implementation, when building the payload we will gather these values from the app state:

Workspace – likely the current workspace name or ID (we normalize it to a short code if needed, e.g. “Business” or B).

Agent ID and Name – the selected agent’s identifier and display name. For instance, agentId might be an internal ID like "cbAgent-B-004-coo" and agentName a human name like "Elena". We can get these from the agent profile object when the user selects an agent.

Model – the name/ID of the model being used (e.g. "Claude 3.5" or "gpt-4"). This is useful in case the system behavior might vary by model.

Role – the role of the agent (in this case “COO”). Often the agent’s persona or job title. Sometimes this can be derived from agentId (as in the example ID ending in coo), but we’ll explicitly include it for clarity.

Council – an array of roles (or agent IDs) that are part of the “council” context. In a multi-agent scenario (like a role-playing session with multiple AI agents), this list tells the model which participants exist. In our example, the council includes CEO, CMO, COO, CTO (probably meaning those agents are available or have contributed context). If the conversation is one-on-one (no council), this could be an empty list or omitted.

We then attach this object to the payload. For instance:

// In payloadBuilder.js
payload.context = {
  workspace: currentWorkspaceIdOrName,
  agentId: selectedAgent.id,
  agentName: selectedAgent.name,
  model: selectedModel.id,
  role: selectedAgent.role,
  council: activeCouncilRolesArray 
};


After building this, the payload (which will be sent to the LLM API) always contains the context field. On the backend or in the LLM wrapper, we will use this context. There are a couple of ways to utilize it:

As a system-level prompt: We can convert this context into a system message at runtime. For example, before the user’s message, prepend something like:

System message: “[COO Elena — Business Council]”

This could be a simple bracketed line or a more verbose instruction: “You are Elena, the Chief Operating Officer in the Business workspace. You are collaborating with a council of colleagues (CEO, CMO, COO, CTO). Respond in the voice of Elena fulfilling the COO role.” By providing this as the first system message, the model is primed to act according to that role and context
clarifai.com
. Using system messages for contextual metadata is a best practice: the system role can define the AI’s identity and context before it sees user input
clarifai.com
.

Via metadata (if supported): Some advanced AI platforms allow sending context as a separate payload field (for logging or for the model to use via tools). In our case, since we control the conversation format, we likely will integrate it into the prompt text as above. But we keep the context object separate in the payload structure as well, which can be useful for our own validation or future features. In fact, the app’s context validation logic will merge this payload.context with the payload to ensure consistency. (The snippet from contextValidation.js in the code base shows it merging payload and context and doing checks like ensuring the agent’s workspace prefix matches the selected workspace, etc., to avoid mismatches. By always injecting the correct context, we reduce the chance of an “unverified” or “missing agent” state.)

UI simulation header (optional): In the chat UI, we could optionally display the context for the user’s reference. For example, showing a faint header at the start of the conversation or above each message from the AI: “COO Elena — Business (Council)”. This is mainly for clarity during testing or debugging, so the user remembers the AI’s persona. It’s not strictly necessary for functionality, so we can hide it in normal use, but it’s easy to implement by reading the context object.

Overall, contextual injection ensures the AI’s responses remain in-character and relevant to the user’s scenario. If the user switches workspace or agent, the context updates accordingly so the AI knows about the new setting. This approach aligns with emerging standards like Anthropic’s Model Context Protocol, which emphasize sharing environment metadata with the AI for better responses
anthropic.com
anthropic.com
.

4. Quota Edge-Case Protection

To guard against hitting usage limits of the AI provider, we’ll implement client-side quota awareness and automatic fallbacks:

Monitoring usage vs quota: The application will keep track of how many tokens the user has used and how many remain (we assume the backend or billing system provides tokens.used and tokens.remaining, e.g. via the billing panel or an API call). For example, if a user’s plan allows 1,000,000 tokens/month and they’ve used 950,000, that’s 95% usage. We will check this percentage whenever a new prompt is about to be sent (or after each response). If the usage crosses certain thresholds (like 95%), we trigger warnings. Many services send alerts at 80% or 90% as well, but for brevity we focus on the high threshold
kinde.com
.

Warning at >95% quota: Once the user is above 95% of their quota, the UI will display a clear warning. This could be a banner across the chat or an alert icon near the Send button. For example: “⚠️ You have used 95% of your monthly token quota.” This warns that they are about to run out. We’ll also disable or gray-out the expensive model options at this point – for instance, if the user is using a premium model (like GPT-4), continuing might exhaust their quota with the next query. We may still allow sending, but perhaps require confirmation similarly to the large prompt warning: “You’re almost out of tokens for this model. Proceed?”. This gives users a chance to cancel or choose a cheaper model to conserve budget. It’s generally good UX to provide such threshold alerts and let users decide how to proceed
kinde.com
kinde.com
.

Hard stop and fallback at 100%: If the user’s token usage has hit or exceeded 100% (quota exhausted), we will block further use of that provider’s premium models and attempt a graceful fallback:

The Send button will be disabled for the over-quota model and a message like “Quota exceeded for this model” will be shown. We don’t want the user to send a request that will surely fail or incur unexpected charges.

Automatic model fallback: If possible, we’ll switch the request to an alternative model that is either free or has its own quota. For instance, if the user was on GPT-4 which is now unavailable, the app could automatically downgrade the selection to o1-mini (a smaller OpenAI model) or to GPT-4o-mini, which might be a lightweight model we support
platform.openai.com
platform.openai.com
. These “mini” models are cheaper and presumably have separate or unlimited quota in our system. By routing the request to a less expensive model, we “keep the lights on” for the user
statsig.com
statsig.com
. The assistant will still respond, albeit with a possibly lower-quality model, instead of failing outright. We will inform the user of this substitution via a notice in the chat: e.g. “Model GPT-4 is not available due to quota limits. Using o1-mini model instead.” This way the user isn’t confused by the change in output style.

If no fallback is available (say all providers are exhausted), then we have to block the request entirely and prompt the user to upgrade their plan or wait for quota reset. We’ll handle this by a clear error message (and not sending the request to avoid an API error).

Disabling premium options: In the model selector UI (perhaps a dropdown or buttons in chat.js), once quota is exceeded for a certain provider, we will disable those options. For example, if OpenAI quota is over, disable GPT-4, GPT-3.5, etc. If Anthropic’s quota is fine, maybe Claude is still enabled. Each provider or model family could have its own usage tracking. The disabled options can show a tooltip on hover: “Disabled – quota exceeded” so the user knows why they can’t select it. This implementation likely touches the component that renders model choices – we’ll add conditional logic to check quota status and render a disabled state.

Integration with usage data: We need to get live quota info. The front end might poll an endpoint or receive updates when usage changes. Since the billing panel already knows tokens.remaining, we could have the app fetch the latest numbers whenever a chat is sent (the response could include updated usage), or periodically. For our implementation, we might call GET /api/billing/usage at app start and perhaps after each message. The response might be like { "used": 950000, "limit": 1000000 }. We then compute percentage = 95%. This can be stored in a global state (for example, in a React context or Redux store) so that components like the model selector and send button can react to it.

Graceful degradation: These checks will be done client-side before sending a request. If for some reason we don’t have usage info (e.g. user not logged in or the usage API failed), we should default to allowing the send (we don’t want false positives blocking the user). So the code will likely be: if (usage data available && used/limit >= 0.95) then warn/disable, else proceed as normal. This way, in absence of data, nothing breaks.

By implementing these quota guardrails, we prevent “bill shock” or sudden cut-offs. The user is alerted well before hitting the limit and the app takes automatic action at the critical point. This approach is akin to having budgetary guardrails in place – we’re effectively enforcing a soft limit and then a hard limit to control costs
medium.com
. And by providing a fallback model, we maintain service continuity so the user isn’t left without answers even if their premium allowance is used up
medium.com
.

With all the above changes, CoolBits.ai’s chat frontend becomes more robust and user-friendly. We establish a clear connection indicator so the user knows their chosen AI (model and agent persona) is ready to go. We give immediate feedback on prompt size and cost, educating users and helping them manage usage. We automatically include contextual metadata so the AI can respond with awareness of the user’s scenario. And finally, we safeguard against hitting provider quotas by warning the user and seamlessly routing to alternate models when necessary. These enhancements collectively improve transparency and reliability of the system, ensuring a smoother experience for the user.

Files touched: Based on the above, we will be editing chat.js and composer.js for the UI changes (status indicator, token counts, send button logic), payloadBuilder.js for injecting context, possibly pricing.config.json to add our pricing matrix, and adding a backend route in statusRouter.js for the agent/model status check. UI components for the composer (like the token preview line and model/agent display) will be updated accordingly. All these changes will use mock data or simple heuristics initially, but are structured to integrate with real backend data when available, without blocking the user interface unnecessarily.

