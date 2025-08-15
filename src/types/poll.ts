// Types for Poll-related functionality

export interface CreatePollRequest {
  title: string;
  subject: 'combined-maths' | 'physics' | 'chemistry';
  chapter: string;
  description: string;
  preferredDate: string;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  maxStudents: number;
}

export interface PollFilterParams {
  subject?: string;
  status?: string;
  date?: string;
  page?: number;
  limit?: number;
}

export interface PollResponse {
  _id: string;
  title: string;
  subject: string;
  chapter: string;
  description: string;
  preferredDate: Date;
  timeSlot: string;
  maxStudents: number;
  creator: {
    _id: string;
    name: string;
    email: string;
  };
  votes: string[];
  status: 'active' | 'completed' | 'scheduled';
  targetVotes: number;
  scheduledDate?: Date;
  tutor?: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
  voteCount: number;
  hasVoted: boolean;
}

export interface TrendingPollResponse {
  _id: string;
  title: string;
  subject: string;
  chapter: string;
  votes: number;
  targetVotes: number;
  timeLeft: string;
  status: string;
  creator: string;
}

export interface PollStats {
  totalPolls: number;
  activePolls: number;
  scheduledPolls: number;
  completedPolls: number;
  totalVotes: number;
}

export interface SubjectStats {
  subject: string;
  pollCount: number;
  totalVotes: number;
  activePolls: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  pagination?: PaginationInfo;
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
}

export interface PaginationInfo {
  current: number;
  pages: number;
  total: number;
}

export interface VoteResponse {
  pollId: string;
  voteCount: number;
  status: string;
  scheduled?: boolean;
}

export interface UpdatePollStatusRequest {
  status: 'active' | 'completed' | 'scheduled';
  scheduledDate?: string;
  tutor?: string;
}

// Remove the duplicate AuthRequest interface - use the one from auth.ts instead

// Frontend state interface for your React component
export interface PollState {
  title: string;
  subject: string;
  chapter: string;
  description: string;
  preferredDate: string;
  timeSlot: string;
  maxStudents: string;
}

export interface FilterState {
  subject: string;
  status: string;
  date: string;
}

// API endpoint constants
export const POLL_ENDPOINTS = {
  CREATE_POLL: '/api/polls',
  GET_POLLS: '/api/polls',
  GET_TRENDING: '/api/polls/trending',
  GET_STATS: '/api/polls/stats',
  GET_BY_SUBJECT: '/api/polls/by-subject',
  SEARCH_POLLS: '/api/polls/search',
  GET_USER_CREATED: '/api/polls/user/created',
  GET_USER_VOTED: '/api/polls/user/voted',
  VOTE_ON_POLL: (id: string) => `/api/polls/${id}/vote`,
  GET_POLL: (id: string) => `/api/polls/${id}`,
  UPDATE_STATUS: (id: string) => `/api/polls/${id}/status`,
  DELETE_POLL: (id: string) => `/api/polls/${id}`,
  CHECK_SCHEDULING: '/api/polls/check-scheduling'
} as const;

// Subject options for frontend dropdown
export const SUBJECT_OPTIONS = [
  { value: 'data-structures', label: 'Data Structures' },
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'database', label: 'Database Systems' },
  { value: 'web-dev', label: 'Web Development' },
  { value: 'mobile-dev', label: 'Mobile Development' }
] as const;

// Time slot options
export const TIME_SLOT_OPTIONS = [
  { value: 'morning', label: 'Morning (8AM - 12PM)' },
  { value: 'afternoon', label: 'Afternoon (1PM - 5PM)' },
  { value: 'evening', label: 'Evening (6PM - 10PM)' }
] as const;

// Status options
export const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'scheduled', label: 'Scheduled' }
] as const;

// Date filter options
export const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
] as const;