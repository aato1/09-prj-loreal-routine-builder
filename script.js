/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const generateRoutineButton = document.getElementById("generateRoutine");
const clearSelectedProductsButton = document.getElementById(
  "clearSelectedProducts",
);
const resetConversationButton = document.getElementById("resetConversation");
const directionToggleButton = document.getElementById("directionToggle");

const WORKER_URL = "https://calm-art-d358.aato1.workers.dev/";
const SELECTED_PRODUCTS_STORAGE_KEY = "loreal-selected-product-ids";
const DIRECTION_MODE_STORAGE_KEY = "loreal-direction-mode";
const MAX_CONTINUATION_CALLS = 6;
const MAX_HISTORY_MESSAGES = 16;

const BEAUTY_TOPIC_KEYWORDS = [
  "routine",
  "skincare",
  "skin",
  "hair",
  "haircare",
  "shampoo",
  "conditioner",
  "scalp",
  "makeup",
  "foundation",
  "mascara",
  "lipstick",
  "fragrance",
  "perfume",
  "sunscreen",
  "spf",
  "cleanser",
  "moisturizer",
  "serum",
  "retinol",
  "acne",
  "sensitive",
  "beauty",
  "cosmetic",
];

const ASSISTANT_SCOPE_PROMPT =
  "You are a helpful beauty advisor for skincare, haircare, makeup, fragrance, and routines. Only answer questions related to these topics or to the generated routine and selected products. If a user asks something outside these topics, politely refuse and redirect them back to beauty or routine questions. Keep answers clear and beginner-friendly. Use markdown with short headings and bullet points when useful.";

const WEB_SEARCH_TRIGGER_KEYWORDS = [
  "current",
  "latest",
  "today",
  "recent",
  "new",
  "launch",
  "release",
  "news",
  "2026",
  "this year",
  "trend",
];

const RTL_LANGS = new Set([
  "ar",
  "arc",
  "dv",
  "fa",
  "ha",
  "he",
  "iw",
  "ji",
  "ku",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);

let directionMode = "auto";

/* Keep product and selection state in memory so UI stays in sync */
let allProducts = [];
let visibleProducts = [];
let searchQuery = "";
const selectedProductIds = new Set();
const expandedProductIds = new Set();
let conversationHistory = [];
let selectedProductsContext = [];
let latestRoutineContext = "";

function isRtlLanguage(langValue) {
  if (!langValue) {
    return false;
  }

  const primaryLanguage = langValue.toLowerCase().split("-")[0];
  return RTL_LANGS.has(primaryLanguage);
}

function getAutoDirection() {
  return isRtlLanguage(document.documentElement.lang) ? "rtl" : "ltr";
}

function getAppliedDirection() {
  if (directionMode === "auto") {
    return getAutoDirection();
  }

  return directionMode;
}

function updateDirectionToggleLabel() {
  const appliedDirection = getAppliedDirection();
  const modeLabel =
    directionMode === "auto" ? "Auto" : directionMode.toUpperCase();
  directionToggleButton.title =
    directionMode === "auto"
      ? `Direction: Auto (${appliedDirection.toUpperCase()})`
      : `Direction: ${modeLabel}`;
  directionToggleButton.querySelector(".direction-toggle-value").textContent =
    modeLabel;
}

function applyDirection() {
  document.documentElement.dir = getAppliedDirection();
  updateDirectionToggleLabel();
}

function loadDirectionModeFromStorage() {
  try {
    const storedMode = localStorage.getItem(DIRECTION_MODE_STORAGE_KEY);
    if (storedMode === "ltr" || storedMode === "rtl" || storedMode === "auto") {
      directionMode = storedMode;
    }
  } catch (error) {
    console.error("Could not load direction mode from localStorage:", error);
  }
}

function saveDirectionModeToStorage() {
  try {
    localStorage.setItem(DIRECTION_MODE_STORAGE_KEY, directionMode);
  } catch (error) {
    console.error("Could not save direction mode to localStorage:", error);
  }
}

function setDirectionMode(nextMode) {
  directionMode = nextMode;
  saveDirectionModeToStorage();
  applyDirection();
}

function cycleDirectionMode() {
  if (directionMode === "auto") {
    setDirectionMode("rtl");
    return;
  }

  if (directionMode === "rtl") {
    setDirectionMode("ltr");
    return;
  }

  setDirectionMode("auto");
}

/* Restore selected product IDs from localStorage on load */
function loadSelectedProductsFromStorage() {
  try {
    const rawValue = localStorage.getItem(SELECTED_PRODUCTS_STORAGE_KEY);

    if (!rawValue) {
      return;
    }

    const parsedIds = JSON.parse(rawValue);

    if (!Array.isArray(parsedIds)) {
      return;
    }

    parsedIds.forEach((id) => {
      if (Number.isInteger(id)) {
        selectedProductIds.add(id);
      }
    });
  } catch (error) {
    console.error("Could not load selected products from localStorage:", error);
  }
}

/* Save selected product IDs to localStorage after each change */
function saveSelectedProductsToStorage() {
  try {
    const ids = [...selectedProductIds];
    localStorage.setItem(SELECTED_PRODUCTS_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error("Could not save selected products to localStorage:", error);
  }
}

/* Remove any IDs that do not exist in current product catalog */
function syncSelectedIdsWithCatalog() {
  const validIds = new Set(allProducts.map((product) => product.id));
  let changed = false;

  [...selectedProductIds].forEach((id) => {
    if (!validIds.has(id)) {
      selectedProductIds.delete(id);
      changed = true;
    }
  });

  if (changed) {
    saveSelectedProductsToStorage();
  }
}

/* Keep selected section controls in sync with current selection count */
function updateSelectedControlsState() {
  clearSelectedProductsButton.disabled = selectedProductIds.size === 0;
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

loadSelectedProductsFromStorage();
loadDirectionModeFromStorage();
applyDirection();

const languageObserver = new MutationObserver(() => {
  if (directionMode === "auto") {
    applyDirection();
  }
});

languageObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
});

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    const emptyMessage = searchQuery
      ? "No matching products found. Try a different keyword."
      : "No products found for this category yet";

    productsContainer.innerHTML = `
      <div class="placeholder-message">
        ${emptyMessage}
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card ${
      selectedProductIds.has(product.id) ? "selected" : ""
    } ${
      expandedProductIds.has(product.id) ? "details-open" : ""
    }" data-product-id="${product.id}" role="button" tabindex="0" aria-pressed="${selectedProductIds.has(
      product.id,
    )}">
      <span class="card-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <div class="product-meta">
          <p class="product-brand">${product.brand}</p>
          <button
            class="details-toggle"
            type="button"
            data-product-id="${product.id}"
            aria-label="Toggle product details"
            aria-expanded="${expandedProductIds.has(product.id)}"
            title="Toggle details"
          >
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
        <p class="product-description">${product.description}</p>
      </div>
    </div>
  `,
    )
    .join("");
}

/* Match products by name, brand, category, or description keywords */
function productMatchesSearch(product, query) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const searchableFields = [
    product.name,
    product.brand,
    product.category,
    product.description,
  ];

  return searchableFields.some((field) =>
    String(field).toLowerCase().includes(normalizedQuery),
  );
}

/* Apply category and search filters together */
function applyProductFilters() {
  if (allProducts.length === 0) {
    return;
  }

  const categoryValue = categoryFilter.value;

  if (!categoryValue) {
    visibleProducts = [];
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory = product.category === categoryValue;
    const matchesSearch = productMatchesSearch(product, searchQuery);
    return matchesCategory && matchesSearch;
  });

  visibleProducts = filteredProducts;
  displayProducts(visibleProducts);
  renderSelectedProducts();
}

/* Render selected products as clickable chips for quick unselect */
function renderSelectedProducts() {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.has(product.id),
  );

  updateSelectedControlsState();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="placeholder-message">No products selected yet</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <button class="selected-chip" type="button" data-product-id="${product.id}" title="Click to remove">
        <i class="fa-solid fa-check"></i>
        <span class="chip-text">
          <span class="chip-name">${product.name}</span>
          <span class="chip-brand">${product.brand}</span>
        </span>
      </button>
    `,
    )
    .join("");
}

/* Toggle selection from either product cards or selected chips */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelectedProductsToStorage();
  displayProducts(visibleProducts);
  renderSelectedProducts();
}

/* Remove all selected products and sync UI + storage */
function clearAllSelectedProducts() {
  selectedProductIds.clear();
  saveSelectedProductsToStorage();
  displayProducts(visibleProducts);
  renderSelectedProducts();
}

/* Keep details open/closed independently from product selection */
function toggleProductDetails(productId) {
  if (expandedProductIds.has(productId)) {
    expandedProductIds.delete(productId);
  } else {
    expandedProductIds.add(productId);
  }

  displayProducts(visibleProducts);
}

/* Return only fields needed for routine generation */
function getSelectedProductsForPrompt() {
  return allProducts
    .filter((product) => selectedProductIds.has(product.id))
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));
}

/* Escape HTML before inserting formatted message content */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Support simple markdown features in assistant responses */
function renderInlineMarkdown(text) {
  let safe = escapeHtml(text);

  safe = safe.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return safe
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/* Convert markdown-like text into basic HTML for chat bubbles */
function renderMarkdown(message) {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const htmlParts = [];
  let paragraphLines = [];
  let inList = false;
  let inOrderedList = false;
  let inBlockquote = false;

  function isTableSeparatorLine(line) {
    const trimmed = line.trim();
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => renderInlineMarkdown(cell.trim()));
  }

  function isLikelyTableLine(line) {
    const trimmed = line.trim();
    return trimmed.includes("|") && trimmed.length > 0;
  }

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    htmlParts.push(`<p>${paragraphLines.join("<br>")}</p>`);
    paragraphLines = [];
  }

  function closeList() {
    if (!inList) {
      return;
    }

    htmlParts.push("</ul>");
    inList = false;
  }

  function closeOrderedList() {
    if (!inOrderedList) {
      return;
    }

    htmlParts.push("</ol>");
    inOrderedList = false;
  }

  function closeBlockquote() {
    if (!inBlockquote) {
      return;
    }

    htmlParts.push("</blockquote>");
    inBlockquote = false;
  }

  function flushBlockState() {
    flushParagraph();
    closeList();
    closeOrderedList();
    closeBlockquote();
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (line === "") {
      flushBlockState();
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      flushBlockState();
      htmlParts.push("<hr>");
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushBlockState();
      const level = headingMatch[1].length;
      htmlParts.push(
        `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
      );
      continue;
    }

    const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
    if (isLikelyTableLine(line) && isTableSeparatorLine(nextLine)) {
      flushBlockState();

      const headers = parseTableRow(line);
      const rows = [];
      i += 2;

      while (i < lines.length && isLikelyTableLine(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }

      i -= 1;

      const headerHtml = `<tr>${headers.map((cell) => `<th>${cell}</th>`).join("")}</tr>`;
      const bodyHtml = rows
        .map(
          (row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
        )
        .join("");

      htmlParts.push(
        `<div class="chat-table-wrap"><table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`,
      );
      continue;
    }

    const blockquoteMatch = line.match(/^>\s+(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      closeList();
      closeOrderedList();
      if (!inBlockquote) {
        htmlParts.push("<blockquote>");
        inBlockquote = true;
      }
      htmlParts.push(`<p>${renderInlineMarkdown(blockquoteMatch[1])}</p>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      closeOrderedList();
      closeBlockquote();
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      htmlParts.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    const orderedListMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (orderedListMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      if (!inOrderedList) {
        htmlParts.push("<ol>");
        inOrderedList = true;
      }
      htmlParts.push(`<li>${renderInlineMarkdown(orderedListMatch[1])}</li>`);
      continue;
    }

    flushBlockState();

    paragraphLines.push(renderInlineMarkdown(line));
  }

  flushParagraph();
  closeList();
  closeOrderedList();
  closeBlockquote();

  return htmlParts.join("") || `<p>${renderInlineMarkdown(message)}</p>`;
}

/* Write message content to a chat bubble as plain text or markdown */
function setChatMessageContent(bubble, message, isMarkdown = false) {
  if (isMarkdown) {
    bubble.innerHTML = renderMarkdown(message);
  } else {
    bubble.textContent = message;
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Add one chat bubble to the chat window */
function addChatMessage(role, message, isMarkdown = false) {
  chatWindow.classList.add("expanded");

  const bubble = document.createElement("div");
  bubble.className = `chat-message ${role}`;
  setChatMessageContent(bubble, message, isMarkdown);
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* Extract citation links from different OpenAI response shapes */
function extractCitationsFromResponse(data) {
  const citationMap = new Map();

  function addCitation(url, title) {
    if (!url || !url.startsWith("http")) {
      return;
    }

    if (!citationMap.has(url)) {
      citationMap.set(url, title || url);
    }
  }

  const choiceAnnotations = data?.choices?.[0]?.message?.annotations;
  if (Array.isArray(choiceAnnotations)) {
    choiceAnnotations.forEach((annotation) => {
      if (annotation?.type === "url_citation") {
        addCitation(
          annotation.url || annotation?.url_citation?.url,
          annotation.title || annotation?.url_citation?.title,
        );
      }
    });
  }

  if (Array.isArray(data?.output)) {
    data.output.forEach((item) => {
      const contentParts = item?.content;
      if (!Array.isArray(contentParts)) {
        return;
      }

      contentParts.forEach((part) => {
        if (!Array.isArray(part?.annotations)) {
          return;
        }

        part.annotations.forEach((annotation) => {
          if (annotation?.type === "url_citation") {
            addCitation(
              annotation.url || annotation?.url_citation?.url,
              annotation.title || annotation?.url_citation?.title,
            );
          }
        });
      });
    });
  }

  return [...citationMap.entries()].map(([url, title]) => ({ url, title }));
}

/* Add source section to assistant text when citations are available */
function appendCitationsSection(text, citations) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return text;
  }

  const sourcesList = citations
    .map((citation) => `- ${citation.title}: ${citation.url}`)
    .join("\n");

  return `${text}\n\n### Sources\n${sourcesList}`;
}

/* Decide when to ask backend for web search support */
function shouldUseWebSearch(question) {
  const lowerQuestion = question.toLowerCase();
  return WEB_SEARCH_TRIGGER_KEYWORDS.some((keyword) =>
    lowerQuestion.includes(keyword),
  );
}

/* Send one chat completion request to the Cloudflare Worker */
async function requestRoutineChunk(messages, selectedProducts, options = {}) {
  const requestBody = {
    model: "gpt-4o",
    max_tokens: 1400,
    messages,
    selectedProducts,
  };

  if (options.enableWebSearch) {
    requestBody.tools = [{ type: "web_search" }];
    requestBody.tool_choice = "auto";
  }

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  const contentFromChoices = data.choices?.[0]?.message?.content || "";
  const contentFromOutput = Array.isArray(data.output)
    ? data.output
        .filter((item) => item?.type === "message")
        .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
        .filter((part) => part?.type === "output_text")
        .map((part) => part.text || "")
        .join("\n\n")
    : "";
  const content =
    contentFromChoices || data.output_text || contentFromOutput || "";
  const finishReason =
    data.choices?.[0]?.finish_reason ||
    (data?.incomplete_details?.reason === "max_output_tokens"
      ? "length"
      : "stop");
  const citations = extractCitationsFromResponse(data);

  return {
    content,
    finishReason,
    citations,
  };
}

/* Keep requesting continuation chunks until output is complete */
async function getFullAssistantResponse(
  initialMessages,
  selectedProducts,
  options = {},
) {
  const messages = [...initialMessages];
  let combinedText = "";
  const allCitations = [];

  for (let attempt = 0; attempt < MAX_CONTINUATION_CALLS; attempt += 1) {
    const { content, finishReason, citations } = await requestRoutineChunk(
      messages,
      selectedProducts,
      options,
    );

    if (!content.trim()) {
      if (attempt < MAX_CONTINUATION_CALLS - 1) {
        messages.push({
          role: "user",
          content:
            "Please provide the final answer text now, using any tool results already gathered.",
        });
        continue;
      }

      break;
    }

    combinedText += combinedText ? `\n\n${content}` : content;
    messages.push({ role: "assistant", content });
    if (Array.isArray(citations) && citations.length > 0) {
      allCitations.push(...citations);
    }

    if (finishReason !== "length") {
      break;
    }

    messages.push({
      role: "user",
      content:
        "Continue exactly where you left off. Return only the continuation text with no repeated lines.",
    });
  }

  return {
    text: appendCitationsSection(combinedText, allCitations),
    citations: allCitations,
  };
}

/* Limit memory size so each request stays focused and efficient */
function appendConversationMessage(role, content) {
  conversationHistory.push({ role, content });

  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  }
}

/* Include routine + selected products context in follow-up answers */
function buildContextSystemMessages() {
  const contextMessages = [];

  if (selectedProductsContext.length > 0) {
    contextMessages.push({
      role: "system",
      content: `Current selected product JSON:\n${JSON.stringify(
        selectedProductsContext,
        null,
        2,
      )}`,
    });
  }

  if (latestRoutineContext) {
    contextMessages.push({
      role: "system",
      content: `Latest generated routine:\n${latestRoutineContext}`,
    });
  }

  return contextMessages;
}

/* Basic client-side check to keep chat focused on supported domains */
function isInAllowedTopic(question) {
  if (conversationHistory.length > 0 || latestRoutineContext) {
    return true;
  }

  const lowerQuestion = question.toLowerCase();
  return BEAUTY_TOPIC_KEYWORDS.some((keyword) =>
    lowerQuestion.includes(keyword),
  );
}

/* Ask assistant a question using stored conversation history */
async function askAssistantQuestion(question) {
  if (!isInAllowedTopic(question)) {
    const outOfScopeMessage =
      "I can help with routines plus skincare, haircare, makeup, and fragrance topics. Try asking a beauty-related question.";
    addChatMessage("assistant", outOfScopeMessage, true);
    appendConversationMessage("user", question);
    appendConversationMessage("assistant", outOfScopeMessage);
    return;
  }

  addChatMessage("user", question);
  const loadingBubble = addChatMessage("assistant", "Thinking...");

  try {
    const initialMessages = [
      {
        role: "system",
        content: `${ASSISTANT_SCOPE_PROMPT} If web search is available, use it for questions about recent or current information and cite sources.`,
      },
      ...buildContextSystemMessages(),
      ...conversationHistory,
      {
        role: "user",
        content: question,
      },
    ];

    const { text: assistantMessage } = await getFullAssistantResponse(
      initialMessages,
      selectedProductsContext,
      {
        enableWebSearch: shouldUseWebSearch(question),
      },
    );

    const finalMessage =
      assistantMessage ||
      "I could not generate a reply this time. Please try your question again.";

    setChatMessageContent(loadingBubble, finalMessage, true);
    appendConversationMessage("user", question);
    appendConversationMessage("assistant", finalMessage);
  } catch (error) {
    const errorMessage = `Something went wrong while answering your question: ${error.message}`;
    setChatMessageContent(loadingBubble, errorMessage);
    appendConversationMessage("user", question);
    appendConversationMessage("assistant", errorMessage);
  }
}

/* Clear chat UI and forget follow-up context so users can start fresh */
function resetConversation() {
  conversationHistory = [];
  selectedProductsContext = [];
  latestRoutineContext = "";
  chatWindow.innerHTML = "";
  chatWindow.classList.remove("expanded");
}

/* Ask the API to build a routine from selected products */
async function generateRoutineFromSelectedProducts() {
  if (allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  const selectedProducts = getSelectedProductsForPrompt();

  if (selectedProducts.length === 0) {
    addChatMessage(
      "assistant",
      "Please select at least one product first, then click Generate Routine.",
    );
    return;
  }

  const selectedNames = selectedProducts
    .map((product) => product.name)
    .join(", ");
  const userRequest = `I'd like to build a routine with ${selectedNames}.`;

  addChatMessage("user", userRequest);

  const loadingBubble = addChatMessage(
    "assistant",
    "Generating your routine...",
  );
  generateRoutineButton.disabled = true;

  try {
    const systemAndContextMessages = [
      {
        role: "system",
        content: ASSISTANT_SCOPE_PROMPT,
      },
      {
        role: "system",
        content:
          "Focus on creating a practical routine from the selected products. Include AM and PM steps, usage order, and short beginner tips.",
      },
    ];

    const routineRequestMessage = {
      role: "user",
      content: `${userRequest}\n\nSelected product JSON:\n${JSON.stringify(
        selectedProducts,
        null,
        2,
      )}`,
    };

    const initialMessages = [
      ...systemAndContextMessages,
      routineRequestMessage,
    ];

    const { text: assistantMessage } = await getFullAssistantResponse(
      initialMessages,
      selectedProducts,
    );

    const finalMessage =
      assistantMessage ||
      "I got a response, but no routine text was returned. Check your Worker response format.";

    setChatMessageContent(loadingBubble, finalMessage, true);

    selectedProductsContext = selectedProducts;
    latestRoutineContext = finalMessage;
    conversationHistory = [];
    appendConversationMessage("user", routineRequestMessage.content);
    appendConversationMessage("assistant", finalMessage);
  } catch (error) {
    setChatMessageContent(
      loadingBubble,
      `Something went wrong while generating the routine: ${error.message}`,
    );
  } finally {
    generateRoutineButton.disabled = false;
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  if (allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  applyProductFilters();
});

productSearch.addEventListener("input", async (e) => {
  searchQuery = e.target.value.trim();

  if (allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  applyProductFilters();
});

/* Let users select/unselect by clicking cards in the product grid */
productsContainer.addEventListener("click", (e) => {
  const detailsButton = e.target.closest(".details-toggle");

  if (detailsButton) {
    e.stopPropagation();
    const detailsProductId = Number(detailsButton.dataset.productId);
    toggleProductDetails(detailsProductId);
    return;
  }

  const card = e.target.closest(".product-card");

  if (!card) {
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

/* Support keyboard selection (Enter/Space) on cards */
productsContainer.addEventListener("keydown", (e) => {
  if (e.target.closest(".details-toggle")) {
    return;
  }

  const card = e.target.closest(".product-card");

  if (!card) {
    return;
  }

  if (e.key !== "Enter" && e.key !== " ") {
    return;
  }

  e.preventDefault();
  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

/* Let users unselect directly from the selected products chips */
selectedProductsList.addEventListener("click", (e) => {
  const chip = e.target.closest(".selected-chip");

  if (!chip) {
    return;
  }

  const productId = Number(chip.dataset.productId);
  toggleProductSelection(productId);
});

clearSelectedProductsButton.addEventListener("click", clearAllSelectedProducts);
resetConversationButton.addEventListener("click", resetConversation);
directionToggleButton.addEventListener("click", cycleDirectionMode);

/* Show initial state in selected section */
renderSelectedProducts();

/* Load products once on startup so stored selections are shown after reload */
async function initializeSelectedProductsSection() {
  if (allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  syncSelectedIdsWithCatalog();
  renderSelectedProducts();
}

initializeSelectedProductsSection();

/* Generate routine from selected products */
generateRoutineButton.addEventListener(
  "click",
  generateRoutineFromSelectedProducts,
);

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  userInput.value = "";
  askAssistantQuestion(question);
});
