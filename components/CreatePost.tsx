import React, { useState, useRef, useEffect } from 'react';
import { Send, Hash, AtSign, X } from 'lucide-react';
import { DEFAULT_AVATAR_URL } from '../constants';

interface CreatePostProps {
  onPost: (nickname: string, content: string, tags: string[]) => void;
  defaultNickname: string;
}

export const CreatePost: React.FC<CreatePostProps> = ({ onPost, defaultNickname }) => {
  const [nickname, setNickname] = useState(defaultNickname);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // CHARACTER LIMIT CONFIGURATION
  const MAX_CHARS = 800;
  const MAX_TAGS = 5;
  
  const charCount = content.length;
  // We force the content to never exceed MAX_CHARS, so this is mainly for full-circle logic
  const isAtLimit = charCount >= MAX_CHARS;
  const remaining = Math.max(0, MAX_CHARS - charCount);
  
  const isTagLimitReached = tags.length >= MAX_TAGS;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // Strict enforcement
    if (val.length <= MAX_CHARS) {
        setContent(val);
    } else {
        // Handle paste overflow
        setContent(val.slice(0, MAX_CHARS));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !content.trim()) return;

    // Merge explicit tags with hashtags in content
    const contentHashtags = content.match(/#[\w]+/g)?.map(t => t.replace('#', '')) || [];
    
    // Process current tag input if any exists but wasn't "entered"
    let currentInputTags: string[] = [];
    if (tagInput.trim()) {
       currentInputTags = tagInput.split(/[\s,]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    }

    // Combine, Deduplicate, and limit to MAX_TAGS
    const finalTags = [...new Set([...tags, ...currentInputTags, ...contentHashtags])].slice(0, MAX_TAGS);

    onPost(nickname, content, finalTags);
    
    // Reset
    setContent('');
    setTags([]);
    setTagInput('');
    setIsFocused(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ' ', ','].includes(e.key)) {
      e.preventDefault();
      
      if (isTagLimitReached) return;

      const newTags = tagInput.split(/[\s,]+/).map(t => t.trim().replace(/^#/, '')).filter(t => t.length > 0);
      if (newTags.length > 0) {
        setTags(prev => [...new Set([...prev, ...newTags])].slice(0, MAX_TAGS)); // No duplicates in chip list
        setTagInput('');
      }
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleFocus = () => setIsFocused(true);

  // Handle outside click to collapse if empty
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (!content.trim() && tags.length === 0 && !tagInput.trim()) {
           setIsFocused(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [content, tags, tagInput]);

  const isExpanded = isFocused || content.length > 0 || tags.length > 0 || tagInput.length > 0;

  // Circular Progress Calculation based on CHARACTERS
  const radius = 14; 
  const circumference = 2 * Math.PI * radius;
  const progressPercentage = Math.min(100, (charCount / MAX_CHARS) * 100);
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;
  
  // Color Logic
  // Green at start, Yellow after 80%, Red at limit
  const progressColor = isAtLimit 
    ? 'text-red-500' 
    : charCount > MAX_CHARS * 0.8 
        ? 'text-yellow-500' 
        : 'text-green-500';

  return (
    <div 
        ref={containerRef}
        className={`
            relative transition-all duration-300 ease-out
            bg-white dark:bg-[#0F0F0F] 
            rounded-[28px] 
            ${isExpanded 
                ? 'shadow-xl shadow-black/5 ring-1 ring-black/5 dark:shadow-white/5 dark:ring-white/10 p-6 mb-8' 
                : 'shadow-sm border border-neutral-200 dark:border-neutral-800 p-4 mb-6 hover:border-neutral-300 dark:hover:border-neutral-700'
            }
        `}
    >
        {/* Header: Identity */}
        <div className={`flex items-center gap-3 mb-4 transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-80'}`}>
            <div className="relative">
                <img 
                    src={DEFAULT_AVATAR_URL(nickname || 'Guest')} 
                    alt="Avatar"
                    className="w-10 h-10 rounded-full border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 object-cover"
                />
                <div className="absolute -bottom-1 -right-1 bg-black dark:bg-white text-white dark:text-black rounded-full p-1 border-2 border-white dark:border-black">
                   <AtSign size={10} />
                </div>
            </div>
            
            <div className="flex flex-col w-full">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Posting as</span>
                <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onFocus={handleFocus}
                    placeholder="Anonymous"
                    maxLength={20}
                    className="bg-transparent border-none outline-none p-0 text-sm font-bold text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 w-full"
                />
            </div>
        </div>

        {/* Text Editor */}
        <textarea
            ref={textareaRef}
            dir="auto"
            value={content}
            maxLength={MAX_CHARS}
            onChange={handleContentChange}
            onFocus={handleFocus}
            placeholder="What's on your mind?"
            className={`
                w-full bg-transparent border-none outline-none focus:ring-0 resize-none 
                text-lg leading-relaxed
                text-neutral-900 placeholder-neutral-400
                dark:text-white dark:placeholder-neutral-600
                min-h-[60px] max-h-[400px]
                transition-all duration-200
            `}
        />

        {/* Interactive Tags */}
        {(isExpanded) && (
            <div className="mt-3 flex flex-wrap gap-2 items-center animate-in fade-in slide-in-from-top-2">
                {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium border border-neutral-200 dark:border-neutral-700">
                        #{tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-red-500 rounded-full p-0.5 transition-colors">
                            <X size={12} />
                        </button>
                    </span>
                ))}
                
                {isTagLimitReached ? (
                    <span className="text-[10px] text-orange-500 font-medium bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-full animate-in fade-in">
                        Max {MAX_TAGS} tags
                    </span>
                ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                        <Hash size={14} className="text-neutral-400" />
                        <input 
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleTagKeyDown}
                            onFocus={handleFocus}
                            placeholder="Add tags..."
                            className="bg-transparent border-none outline-none text-sm text-neutral-600 dark:text-neutral-300 placeholder-neutral-400 flex-1"
                        />
                    </div>
                )}
            </div>
        )}

        {/* Footer Actions */}
        {(isExpanded) && (
            <div className="flex items-center justify-end mt-5 pt-3 border-t border-neutral-100 dark:border-white/5 animate-in fade-in">
                {/* Submit Area */}
                <div className="flex items-center gap-4">
                    {/* Character Count Indicator */}
                    <div className="relative w-10 h-10 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            {/* Background Circle */}
                            <circle
                                cx="18"
                                cy="18"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                className="text-neutral-100 dark:text-neutral-800"
                            />
                            {/* Progress Circle */}
                            <circle
                                cx="18"
                                cy="18"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className={`${progressColor} transition-all duration-300`}
                            />
                        </svg>
                        
                        {/* Always show remaining count if there is content */}
                        <span className={`absolute text-[10px] font-bold ${isAtLimit ? 'text-red-500' : 'text-neutral-400'} transition-colors duration-200`}>
                            {remaining}
                        </span>
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={!content.trim() || !nickname.trim()}
                        className="
                            group flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm transition-all duration-200
                            bg-black text-white hover:bg-neutral-800 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                            dark:bg-white dark:text-black dark:hover:bg-neutral-200
                        "
                    >
                        <span>Post</span>
                        <Send size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};
