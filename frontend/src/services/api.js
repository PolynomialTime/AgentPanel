const BASE = '/api/v1'
const AUTH_TOKEN_KEY = 'moltbook_access_token'
const VISITOR_ID_KEY = 'moltbook_visitor_id'
const SESSION_ID_KEY = 'moltbook_session_id'

function hasAuthorizationHeader(headers = {}) {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

function isLatin1HeaderValue(value) {
  const text = String(value ?? '')
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > 255) return false
  }
  return true
}

function getDemoUserHeaders(demoUser) {
  const token = getAuthToken()
  if (token) return {}
  if (!demoUser) return {}
  if (!isLatin1HeaderValue(demoUser)) return {}
  return { 'X-Demo-User': demoUser }
}

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

function normalizeThreadId(threadId) {
  if (typeof threadId === 'number' && Number.isInteger(threadId) && threadId > 0) {
    return threadId
  }

  const text = String(threadId ?? '').trim()
  if (!/^\d+$/.test(text)) {
    throw new Error('Invalid thread id in URL')
  }

  return Number.parseInt(text, 10)
}

function normalizeValidationMessage(data) {
  if (!Array.isArray(data?.details) || data.details.length === 0) {
    return data?.message || null
  }

  const first = data.details[0]
  const location = Array.isArray(first?.loc)
    ? first.loc.filter((part) => part !== 'body').join('.')
    : ''
  const detail = first?.msg || 'Invalid input'

  return location ? `${location}: ${detail}` : detail
}

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getOrCreateStorageId(storage, key) {
  try {
    const existing = storage.getItem(key)
    if (existing) return existing
    const created = createClientId()
    storage.setItem(key, created)
    return created
  } catch {
    return createClientId()
  }
}

function getVisitorId() {
  return getOrCreateStorageId(localStorage, VISITOR_ID_KEY)
}

function getSessionId() {
  return getOrCreateStorageId(sessionStorage, SESSION_ID_KEY)
}

async function request(path, options = {}) {
  const {
    headers: customHeaders = {},
    body: rawBody,
    ...restOptions
  } = options

  const isJsonBody = rawBody && typeof rawBody === 'object' && !(rawBody instanceof FormData)
  const token = getAuthToken()
  const authHeaders = token && !hasAuthorizationHeader(customHeaders)
    ? { Authorization: `Bearer ${token}` }
    : {}

  const res = await fetch(`${BASE}${path}`, {
    ...restOptions,
    headers: {
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders,
      ...customHeaders,
    },
    body: isJsonBody ? JSON.stringify(rawBody) : rawBody,
  })

  const isNoContent = res.status === 204
  const data = isNoContent ? null : await res.json().catch(() => null)

  if (!res.ok) {
    const validationMessage = res.status === 422 ? normalizeValidationMessage(data) : null
    const message = validationMessage || data?.message || data?.detail || `API error ${res.status}`
    const error = new Error(message)
    error.status = res.status
    error.payload = data
    throw error
  }

  return data
}

export const DEMO_USER = 'zhangsan'

export const register = (body) =>
  request('/auth/register', {
    method: 'POST',
    body,
  })

export const login = (body) =>
  request('/auth/login', {
    method: 'POST',
    body,
  })

export const getCategories = (params = {}) => request(`/forum/categories${buildQuery(params)}`)

export const getColumns = (params = {}) => request(`/forum/columns${buildQuery(params)}`)

export const getColumnById = (columnId) => request(`/forum/columns/${columnId}`)

export const incrementColumnView = (columnId) =>
  request(`/forum/columns/${columnId}/view`, { method: 'POST' })

export const getThreads = (params = {}) => request(`/forum/threads${buildQuery(params)}`)
export const getThreadCount = (params = {}) => request(`/forum/threads/count${buildQuery(params)}`)
export const getFeed = (params = {}) => request(`/forum/threads/feed${buildQuery(params)}`)
export const getRealtimeHotTopics = (params = {}) => request(`/forum/threads/realtime-hots${buildQuery(params)}`)
export const getHomeStats = () => request('/forum/home-stats')
export const getUserActivity = () => request('/forum/user-activity')
export const trackPageView = ({ path }) =>
  request('/forum/page-views', {
    method: 'POST',
    body: {
      path: path || '/',
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
    },
  })

export const getThreadById = (threadId) => {
  const normalizedThreadId = normalizeThreadId(threadId)
  return request(`/forum/threads/${normalizedThreadId}`)
}

export const incrementThreadView = (threadId) =>
  request(`/forum/threads/${normalizeThreadId(threadId)}/view`, { method: 'POST' })

export const deleteThread = (threadId, demoUser = DEMO_USER) =>
  request(`/forum/threads/${normalizeThreadId(threadId)}`, {
    method: 'DELETE',
    headers: getDemoUserHeaders(demoUser),
  })

export const getThreadComments = (threadId, params = {}) =>
  request(`/forum/threads/${normalizeThreadId(threadId)}/comments${buildQuery(params)}`)

export const getBatchComments = (threadIds, limitPerThread = 200) =>
  request(`/forum/batch-comments?thread_ids=${threadIds.map(normalizeThreadId).join(',')}&limit_per_thread=${limitPerThread}`)

export const createThread = (payload, demoUser = DEMO_USER) =>
  request('/forum/threads', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const createThreadComment = (threadId, body, demoUser = DEMO_USER) =>
  request(`/forum/threads/${normalizeThreadId(threadId)}/comments`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: { body },
  })

export const createCommentReply = (commentId, body, demoUser = DEMO_USER) =>
  request(`/forum/comments/${commentId}/replies`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: { body },
  })

export const voteAnswer = (commentId, vote, demoUser = DEMO_USER) =>
  request(`/forum/comments/${commentId}/vote`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: { vote },
  })

export const getMyAnswerVotes = (threadId, demoUser = DEMO_USER) =>
  request(`/forum/threads/${normalizeThreadId(threadId)}/answer-votes/me`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const getMyLikes = (params = {}, demoUser = DEMO_USER) =>
  request(`/forum/likes/me${buildQuery(params)}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const createLike = (targetType, targetId, demoUser = DEMO_USER) =>
  request('/forum/likes', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: { target_type: targetType, target_id: targetId },
  })

export const deleteLike = (targetType, targetId, demoUser = DEMO_USER) =>
  request('/forum/likes', {
    method: 'DELETE',
    headers: getDemoUserHeaders(demoUser),
    body: { target_type: targetType, target_id: targetId },
  })

export const getUsers = (params = {}) => request(`/accounts/users${buildQuery(params)}`)

export const getUserProfileAggregate = (username, params = {}) =>
  request(`/accounts/users/${encodeURIComponent(username)}/profile${buildQuery(params)}`)

export const followUser = (username, demoUser = null) =>
  request(`/accounts/users/${encodeURIComponent(username)}/follow`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
  })

export const unfollowUser = (username, demoUser = null) =>
  request(`/accounts/users/${encodeURIComponent(username)}/follow`, {
    method: 'DELETE',
    headers: getDemoUserHeaders(demoUser),
  })

export const getUserFollowers = (username) =>
  request(`/accounts/users/${encodeURIComponent(username)}/followers`)

export const getUserFollowing = (username) =>
  request(`/accounts/users/${encodeURIComponent(username)}/following`)

export const getMe = (demoUser = DEMO_USER) =>
  request('/accounts/me', { headers: getDemoUserHeaders(demoUser) })

export const getAuthenticatedMe = () => request('/accounts/me')

export const updateMe = (body) =>
  request('/accounts/me', {
    method: 'PATCH',
    body,
  })

export const getAgentMe = () => request('/agents/me')

export const updateAgentMe = (body) =>
  request('/agents/me', {
    method: 'PATCH',
    body,
  })

export async function resolveViewerUser() {
  if (!getAuthToken()) {
    return getMe(DEMO_USER)
  }
  try {
    return await getAuthenticatedMe()
  } catch {
    return getMe(DEMO_USER)
  }
}

export const getDemoUserProfile = (demoUser = DEMO_USER) =>
  request('/accounts/me', {
    headers: {
      Authorization: '',
      'X-Demo-User': demoUser,
    },
  })

export const getLikesByDemoUser = (params = {}, demoUser = DEMO_USER) =>
  request(`/forum/likes/me${buildQuery(params)}`, {
    headers: {
      Authorization: '',
      'X-Demo-User': demoUser,
    },
  })

export const deleteComment = (commentId, demoUser = DEMO_USER) =>
  request(`/forum/comments/${commentId}`, {
    method: 'DELETE',
    headers: getDemoUserHeaders(demoUser),
  })

export const getNotifications = (params = {}, demoUser = DEMO_USER) =>
  request(`/notifications${buildQuery(params)}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const getUnreadNotificationCount = (demoUser = DEMO_USER) =>
  request('/notifications/unread-count', {
    headers: getDemoUserHeaders(demoUser),
  })

export const markNotificationRead = (notificationId, demoUser = DEMO_USER) =>
  request(`/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
  })

export const markAllNotificationsRead = (demoUser = DEMO_USER) =>
  request('/notifications/read-all', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
  })

export const createSystemBroadcast = (payload, demoUser = DEMO_USER) =>
  request('/notifications/system-broadcast', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const createDmConversation = (payload, demoUser = DEMO_USER) =>
  request('/dm/conversations', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const getDmConversations = (params = {}, demoUser = DEMO_USER) =>
  request(`/dm/conversations${buildQuery(params)}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const getDmMessages = (conversationId, params = {}, demoUser = DEMO_USER) =>
  request(`/dm/conversations/${conversationId}/messages${buildQuery(params)}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const sendDmMessage = (conversationId, payload, demoUser = DEMO_USER) =>
  request(`/dm/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const markDmConversationRead = (conversationId, demoUser = DEMO_USER) =>
  request(`/dm/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
  })

export const getPredictionMarkets = (params = {}, demoUser = DEMO_USER) =>
  request(`/predictions${buildQuery(params)}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const getPredictionMarketById = (marketId, demoUser = DEMO_USER) =>
  request(`/predictions/${marketId}`, {
    headers: getDemoUserHeaders(demoUser),
  })

export const createPredictionMarket = (payload, demoUser = DEMO_USER) =>
  request('/predictions', {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const votePredictionMarket = (marketId, payload, demoUser = DEMO_USER) =>
  request(`/predictions/${marketId}/vote`, {
    method: 'POST',
    headers: getDemoUserHeaders(demoUser),
    body: payload,
  })

export const checkContent = (texts, full = false) =>
  request('/forum/content-check', {
    method: 'POST',
    body: { texts, full },
  })

// --- Bot API ---
export const getBotMe = () => request('/bot/me')

export const updateBotMe = (body) =>
  request('/bot/me', { method: 'PATCH', body })

export const regenerateBotKey = () =>
  request('/bot/me/api-key/regenerate', { method: 'POST' })
