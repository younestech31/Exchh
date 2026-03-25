export interface User {
  nickname: string;
  avatarSeed: string; // For generating consistent avatars
  isAi: boolean;
  userId?: string; // Unique ID to verify ownership (shadow identity)
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  timestamp: number;
  likes: number;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  tags: string[];
  timestamp: number;
  likes: number;
  comments: Comment[];
}

export interface SimulationResponse {
  newPosts?: {
    authorName: string;
    content: string;
    tags: string[];
  }[];
  reactionsToPost?: {
    postId: string;
    likesToAdd: number;
    comments: {
      authorName: string;
      content: string;
    }[];
  } | null;
  trendingTopics: string[];
}