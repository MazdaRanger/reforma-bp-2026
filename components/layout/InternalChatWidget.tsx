
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db, INTERNAL_CHATS_COLLECTION, USERS_COLLECTION } from '../../services/firebase';
import { ChatMessage, UserProfile } from '../../types';
import { MessageCircle, Send, X, Minimize2, User, Loader2, AlertCircle, Trash2, Users, ChevronDown, Lock } from 'lucide-react';

interface InternalChatWidgetProps {
  currentUser: UserProfile;
}

const InternalChatWidget: React.FC<InternalChatWidgetProps> = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Chat Context State: 'GLOBAL' or UserUID for Private
  const [activeChatId, setActiveChatId] = useState<string>('GLOBAL');
  const [isUserListOpen, setIsUserListOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch Users for Private Chat Selection
  useEffect(() => {
      const fetchUsers = async () => {
          try {
              const q = query(collection(db, USERS_COLLECTION));
              const snap = await getDocs(q);
              const userList = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
              // Exclude self
              setUsers(userList.filter(u => u.email?.toLowerCase() !== currentUser.email?.toLowerCase()));
          } catch (e) {
              console.error("Failed loading users", e);
          }
      };
      if (isOpen) fetchUsers();
  }, [isOpen, currentUser.email]);

  // Listen to Messages (Fetch Broadly, Filter Locally)
  useEffect(() => {
    if (isOpen) {
        setLoading(true);
        setError(null);
        
        // Increased limit to support filtering client-side for PMs
        const q = query(
            collection(db, INTERNAL_CHATS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(150)
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const msgs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as ChatMessage));
                
                // Keep reverse order (newest last) for scrolling
                setMessages(msgs.reverse());
                setLoading(false);
                setTimeout(scrollToBottom, 100);
            },
            (err) => {
                console.error("Chat Error:", err);
                setError("Gagal memuat chat. Periksa koneksi/izin.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }
  }, [isOpen]);

  // Filter Messages based on Active Context
  const filteredMessages = useMemo(() => {
      return messages.filter(msg => {
          if (activeChatId === 'GLOBAL') {
              // Show only global messages (no recipient)
              return !msg.recipientId; 
          } else {
              // Private: Show if (Sender is Me AND Recipient is Them) OR (Sender is Them AND Recipient is Me)
              return (
                  (msg.senderId === currentUser.uid && msg.recipientId === activeChatId) ||
                  (msg.senderId === activeChatId && msg.recipientId === currentUser.uid)
              );
          }
      });
  }, [messages, activeChatId, currentUser.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim()) return;

      try {
          const payload: any = {
              text: newMessage,
              senderId: currentUser.uid,
              senderName: currentUser.displayName || 'User',
              senderRole: currentUser.role || 'Staff',
              createdAt: serverTimestamp()
          };

          // If Private Chat, add recipient
          if (activeChatId !== 'GLOBAL') {
              payload.recipientId = activeChatId;
          } else {
              payload.recipientId = null;
          }

          await addDoc(collection(db, INTERNAL_CHATS_COLLECTION), payload);
          setNewMessage('');
          setTimeout(scrollToBottom, 50);
      } catch (error) {
          console.error("Error sending message:", error);
      }
  };

  const handleDeleteMessage = async (msgId: string) => {
      if(!window.confirm("Hapus pesan ini? (Terhapus untuk semua user)")) return;
      try {
          await deleteDoc(doc(db, INTERNAL_CHATS_COLLECTION, msgId));
      } catch (error) {
          console.error("Error deleting:", error);
      }
  };

  const activeRecipientName = useMemo(() => {
      if (activeChatId === 'GLOBAL') return 'Global Room';
      const u = users.find(user => user.uid === activeChatId);
      return u ? u.displayName : 'Unknown User';
  }, [activeChatId, users]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* Chat Window */}
        {isOpen && (
            <div className="mb-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[500px] max-h-[80vh] animate-pop-in ring-1 ring-black/5">
                {/* Header */}
                <div className="bg-indigo-600 p-3 flex justify-between items-center text-white shrink-0 shadow-md z-20">
                    <div className="flex-grow relative">
                        <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                            onClick={() => setIsUserListOpen(!isUserListOpen)}
                        >
                            {activeChatId === 'GLOBAL' ? <Users size={18}/> : <Lock size={16} className="text-yellow-300"/>}
                            <div>
                                <h3 className="font-bold text-xs flex items-center gap-1">
                                    {activeRecipientName} <ChevronDown size={12}/>
                                </h3>
                                <p className="text-[9px] text-indigo-200">{activeChatId === 'GLOBAL' ? 'Semua Staff' : 'Private Message'}</p>
                            </div>
                        </div>

                        {/* Dropdown User Selector */}
                        {isUserListOpen && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden text-gray-800 animate-fade-in z-50">
                                <div className="max-h-60 overflow-y-auto scrollbar-thin">
                                    <button 
                                        onClick={() => { setActiveChatId('GLOBAL'); setIsUserListOpen(false); }}
                                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 ${activeChatId === 'GLOBAL' ? 'bg-indigo-50 text-indigo-700 font-bold' : ''}`}
                                    >
                                        <div className="p-1.5 bg-indigo-100 rounded-full"><Users size={14}/></div>
                                        <span className="text-xs">Global Room (Public)</span>
                                    </button>
                                    <div className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase bg-gray-50">Private Message (Japri)</div>
                                    {users.map(u => (
                                        <button 
                                            key={u.uid}
                                            onClick={() => { setActiveChatId(u.uid); setIsUserListOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 transition-colors ${activeChatId === u.uid ? 'bg-indigo-50 text-indigo-700 font-bold' : ''}`}
                                        >
                                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-black text-gray-500">
                                                {(u.displayName || 'U')[0].toUpperCase()}
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="text-xs truncate">{u.displayName}</div>
                                                <div className="text-[9px] text-gray-400 truncate">{u.role}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><Minimize2 size={16}/></button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow overflow-y-auto p-4 bg-gray-50 scrollbar-thin space-y-3 relative">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-gray-400">
                            <Loader2 className="animate-spin" size={24}/>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col justify-center items-center h-full text-red-400 text-xs text-center p-4">
                            <AlertCircle size={24} className="mb-2"/>
                            {error}
                        </div>
                    ) : filteredMessages.length === 0 ? (
                        <div className="text-center text-gray-400 text-xs mt-10">
                            <p>Belum ada pesan {activeChatId !== 'GLOBAL' ? 'pribadi' : ''}.</p>
                            <p className="text-[10px] mt-1">Mulai percakapan dengan tim!</p>
                        </div>
                    ) : (
                        filteredMessages.map(msg => {
                            const isMe = msg.senderId === currentUser.uid;
                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm relative ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'}`}>
                                        {!isMe && (
                                            <p className="text-[10px] font-bold text-indigo-600 mb-0.5 flex items-center gap-1">
                                                {msg.senderName} <span className="text-gray-400 font-normal">• {msg.senderRole}</span>
                                            </p>
                                        )}
                                        <p className="leading-relaxed break-words">{msg.text}</p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] text-gray-400 px-1">
                                            {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Sending...'}
                                        </span>
                                        {/* DELETE BUTTON (Available for all roles per request) */}
                                        <button 
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
                                            title="Hapus Pesan"
                                        >
                                            <Trash2 size={10}/>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0">
                    <input 
                        type="text" 
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder={activeChatId === 'GLOBAL' ? "Ketik pesan publik..." : "Ketik pesan rahasia..."}
                        className={`flex-grow bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 outline-none ${activeChatId === 'GLOBAL' ? 'focus:ring-indigo-500' : 'focus:ring-yellow-400 bg-yellow-50'}`}
                    />
                    <button 
                        type="submit" 
                        disabled={!newMessage.trim()}
                        className={`text-white p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md ${activeChatId === 'GLOBAL' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                    >
                        <Send size={18}/>
                    </button>
                </form>
            </div>
        )}

        {/* Toggle Button */}
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`p-4 rounded-full shadow-2xl transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center relative ${isOpen ? 'bg-gray-200 text-gray-600 rotate-90' : 'bg-indigo-600 text-white'}`}
        >
            {isOpen ? <X size={24}/> : <MessageCircle size={28} className="fill-white"/>}
            {!isOpen && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
            )}
        </button>
    </div>
  );
};

export default InternalChatWidget;
