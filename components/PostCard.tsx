import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, MoreVertical, Trash2, Send, X, ChevronDown, ChevronUp, AtSign } from 'lucide-react';
import { Post, Comment } from '../types';
import { DEFAULT_AVATAR_URL } from '../constants';
import { toggleLike, createComment, deleteComment } from '../services/supabaseClient';

interface PostCardProps {
  post: Post;
  isUser: boolean;
  currentUserId: string | null;
  onDelete?: (id: string) => void;
  onTagClick?: (tag: string) => void;
  onUserClick?: (user: { userId: string; nickname: string }) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, isUser, onDelete, onTagClick, onUserClick, currentUserId }) => {
  const [liked, setLiked] = useState(false);
  const [optimisticLikes, setOptimisticLikes] = useState(post.likes);
  
  // Comment State
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Mention State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1); // Where the @ started
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync props to state if post updates from parent (real-time)
  useEffect(() => {
    setComments(post.comments || []);
  }, [post.comments]);

  const handleLike = () => {
    const isLiking = !liked;
    setLiked(isLiking);
    setOptimisticLikes(prev => isLiking ? prev + 1 : prev - 1);
    toggleLike(post.id, isLiking);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this post?') && onDelete) {
      onDelete(post.id);
    }
  };

  const handleTagClick = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTagClick) onTagClick(tag);
  };

  const handleUserClick = (e: React.MouseEvent, userOverride?: { userId: string; nickname: string }) => {
    e.stopPropagation();
    if (onUserClick) {
        if (userOverride) {
            onUserClick(userOverride);
        } else {
             // Default to post author
             onUserClick({ 
                 userId: post.author.userId || '', 
                 nickname: post.author.nickname 
             });
        }
    }
  }

  const toggleComments = () => {
    setShowComments(!showComments);
  };

  // --- MENTION LOGIC START ---

  // Get unique participants in this thread for suggestions
  const getThreadParticipants = () => {
    const participants = new Set<string>();
    // Add Post Author
    participants.add(post.author.nickname);
    // Add Commenters
    comments.forEach(c => participants.add(c.author.nickname));
    
    // Convert to array and filter by query
    const all = Array.from(participants);
    if (!mentionQuery) return all;
    return all.filter(name => name.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewCommentText(value);

    // Regex to find the last @word being typed. 
    // Captures group 1 as the name after @
    const match = value.match(/@(\w*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(match.index!);
    } else {
      setMentionQuery(null);
      setMentionIndex(-1);
    }
  };

  const insertMention = (nickname: string) => {
    if (mentionIndex === -1) return;
    
    // Replace the @query with @nickname + space
    const before = newCommentText.substring(0, mentionIndex);
    // We don't use 'after' because we assume cursor is at end for this simple logic
    // but correct logic handles cursor position. For simplicity:
    const newValue = before + `@${nickname} `;
    
    setNewCommentText(newValue);
    setMentionQuery(null);
    setMentionIndex(-1);
    
    // Refocus
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Render text with clickable @mentions
  const renderContentWithMentions = (content: string) => {
    // Split by mention pattern: @nickname
    // We allow alphanumeric, underscores, and hyphens in nicknames
    const parts = content.split(/(@[\w-]+)/g);

    return parts.map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        const nickname = part.substring(1);
        
        // Try to find this user in the thread to get their ID
        // Priority: Post Author -> Commenters
        let matchedUser = null;
        if (post.author.nickname === nickname) matchedUser = post.author;
        else {
            const commentUser = comments.find(c => c.author.nickname === nickname);
            if (commentUser) matchedUser = commentUser.author;
        }

        if (matchedUser && matchedUser.userId) {
             return (
              <span 
                key={i} 
                onClick={(e) => handleUserClick(e, { userId: matchedUser!.userId!, nickname: matchedUser!.nickname })}
                className="font-bold text-black dark:text-white cursor-pointer hover:underline bg-black/5 dark:bg-white/20 px-1 rounded mx-0.5"
              >
                {part}
              </span>
            );
        }

        // Fallback if ID not found (just style it)
        return (
             <span key={i} className="font-bold text-black dark:text-white opacity-70">{part}</span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // --- MENTION LOGIC END ---

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    if (!currentUserId) {
        alert("You must be signed in (or shadow authenticated) to comment.");
        return;
    }

    const text = newCommentText;
    setNewCommentText(''); // Clear input immediately
    setMentionQuery(null); // Clear mentions
    setIsSubmittingComment(true);

    const nickname = localStorage.getItem('echo_nickname') || 'Guest';

    // Optimistic Comment
    const tempId = 'temp-' + Date.now();
    const optimisticComment: Comment = {
      id: tempId,
      author: {
        nickname,
        avatarSeed: nickname,
        isAi: false,
        userId: currentUserId || ''
      },
      content: text,
      timestamp: Date.now(),
      likes: 0
    };

    setComments(prev => [...prev, optimisticComment]);
    if (!showComments) setShowComments(true);

    try {
      const realComment = await createComment(post.id, text, nickname, currentUserId);
      setComments(prev => prev.map(c => c.id === tempId ? realComment : c));
    } catch (err) {
      console.error("Failed to submit comment", err);
      alert("Failed to post comment. Please try again.");
      setComments(prev => prev.filter(c => c.id !== tempId));
      setNewCommentText(text); 
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;

    const previousComments = [...comments];
    setComments(prev => prev.filter(c => c.id !== commentId));

    try {
      await deleteComment(commentId);
    } catch (err) {
      console.error("Failed to delete comment", err);
      alert("Could not delete comment.");
      setComments(previousComments);
    }
  };

  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
  }).format(new Date(post.timestamp));

  return (
    <div className={`
      relative p-5 mb-4 transition-all duration-300
      rounded-[24px] border
      ${isUser 
        ? 'bg-neutral-100 border-neutral-200 text-black dark:bg-[#1A1A1A] dark:border-neutral-700 dark:text-white' 
        : 'bg-white border-neutral-200 text-neutral-800 dark:bg-[#0A0A0A] dark:border-[#1F1F1F] dark:text-neutral-300' 
      }
    `}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div 
            onClick={(e) => handleUserClick(e)}
            className="flex items-center gap-4 group cursor-pointer"
        >
          <img 
            src={DEFAULT_AVATAR_URL(post.author.avatarSeed)} 
            alt={post.author.nickname}
            className="w-10 h-10 rounded-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:scale-105 transition-all border border-neutral-200 dark:border-neutral-800" 
          />
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-medium tracking-wide group-hover:underline ${isUser ? 'text-black dark:text-white' : 'text-neutral-900 dark:text-neutral-200'}`}>
                {post.author.nickname}
              </span>
              {post.author.isAi && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-bold tracking-wider">
                  BOT
                </span>
              )}
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-500">{formattedTime}</span>
          </div>
        </div>
        
        {isUser && (
           <button 
             onClick={handleDelete}
             className="text-neutral-400 hover:text-red-600 dark:text-neutral-500 dark:hover:text-red-400 rounded-full p-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
             title="Delete Post"
           >
             <Trash2 size={18} />
           </button>
        )}
      </div>

      {/* Content */}
      <div className="mb-4 pl-[56px]">
        <p 
            dir="auto" 
            className="text-base leading-relaxed tracking-wide opacity-90 text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap"
        >
          {renderContentWithMentions(post.content)}
        </p>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {post.tags.map(tag => (
              <span 
                key={tag} 
                onClick={(e) => handleTagClick(tag, e)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer
                           bg-neutral-100 border border-neutral-200 text-neutral-600 hover:bg-neutral-200 hover:text-black hover:border-neutral-300
                           dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white dark:hover:border-neutral-600"
              >
                #{tag.replace(/^#/, '')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-6 pl-[56px] pt-1">
        <button 
          onClick={handleLike}
          className={`group flex items-center gap-2 text-sm font-medium transition-colors 
            ${liked 
              ? 'text-black dark:text-white' 
              : 'text-neutral-500 hover:text-black dark:text-neutral-500 dark:hover:text-neutral-300'
            }`}
        >
          <div className={`p-2 rounded-full group-hover:bg-black/5 dark:group-hover:bg-white/10 transition-colors`}>
             <Heart size={20} fill={liked ? "currentColor" : "none"} className={liked ? "scale-110" : ""} />
          </div>
          <span>{optimisticLikes}</span>
        </button>
        
        <button 
          onClick={toggleComments}
          className={`group flex items-center gap-1.5 text-sm font-medium transition-colors
            ${showComments ? 'text-black dark:text-white' : 'text-neutral-500 hover:text-black dark:text-neutral-500 dark:hover:text-white'}
          `}
        >
          <div className="p-2 rounded-full group-hover:bg-black/5 dark:group-hover:bg-white/10 transition-colors">
             <MessageCircle size={20} />
          </div>
          <span>{comments.length}</span>
          <div className="ml-1 opacity-50 group-hover:opacity-100 transition-opacity">
             {showComments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-4 pt-4 pl-[56px] border-t border-neutral-100 dark:border-neutral-800 animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Add Comment Input */}
          <form onSubmit={handleSubmitComment} className="flex gap-3 mb-6 relative z-10">
             <img 
                src={DEFAULT_AVATAR_URL(localStorage.getItem('echo_nickname') || 'Guest')} 
                className="w-8 h-8 rounded-full grayscale opacity-50 shrink-0"
             />
             <div className="flex-1 relative">
                
                {/* Mention Suggestion List */}
                {mentionQuery !== null && (
                    <div className="absolute bottom-full mb-2 left-0 w-full max-h-40 overflow-y-auto bg-white dark:bg-[#1A1A1A] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-20 animate-in zoom-in-95 duration-100">
                        {getThreadParticipants().length > 0 ? (
                            getThreadParticipants().map((participant, idx) => (
                                <button
                                    type="button"
                                    key={idx}
                                    onClick={() => insertMention(participant)}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
                                >
                                    <div className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                                         <img src={DEFAULT_AVATAR_URL(participant)} className="w-full h-full object-cover grayscale" />
                                    </div>
                                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{participant}</span>
                                    {participant === post.author.nickname && (
                                        <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 rounded text-neutral-500">OP</span>
                                    )}
                                </button>
                            ))
                        ) : (
                             <div className="px-4 py-2 text-xs text-neutral-400 italic">No matching users in thread</div>
                        )}
                    </div>
                )}

                <input 
                  ref={inputRef}
                  type="text"
                  dir="auto" 
                  value={newCommentText}
                  onChange={handleInputChange}
                  placeholder="Write a reply... (Type @ to tag)"
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full py-2 px-4 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  autoComplete="off"
                />
                <button 
                  type="submit" 
                  disabled={!newCommentText.trim() || isSubmittingComment}
                  className="absolute right-2 top-1.5 p-1 rounded-full text-black dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  <Send size={14} />
                </button>
             </div>
          </form>

          {/* Comment List */}
          <div className="space-y-5">
            {comments.map(comment => (
              <div key={comment.id} className="flex gap-3 group/comment">
                <img 
                  src={DEFAULT_AVATAR_URL(comment.author.avatarSeed)} 
                  alt={comment.author.nickname}
                  className="w-8 h-8 rounded-full grayscale opacity-70 shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div 
                        className="flex items-center gap-2 mb-0.5 cursor-pointer hover:underline"
                        onClick={(e) => handleUserClick(e, { userId: comment.author.userId || '', nickname: comment.author.nickname })}
                    >
                      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-200">{comment.author.nickname}</span>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                        {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date(comment.timestamp))}
                      </span>
                    </div>
                    
                    {currentUserId === comment.author.userId && (
                      <button 
                        onClick={() => handleDeleteComment(comment.id)}
                        className="opacity-0 group-hover/comment:opacity-100 transition-opacity p-1 text-neutral-400 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  {/* Render content with mentions */}
                  <p 
                    dir="auto"
                    className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap"
                  >
                    {renderContentWithMentions(comment.content)}
                  </p>
                </div>
              </div>
            ))}
            
            {comments.length === 0 && (
                <div className="text-center py-4 opacity-40 text-xs italic">
                    No comments yet. Start the conversation.
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};