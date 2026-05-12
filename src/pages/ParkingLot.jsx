import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Lightbulb, ArrowRight, Trash2, ChevronsDown, ChevronsUp, Search, Sparkles, Loader2, Filter, Mic, MoreVertical, CheckCircle2, Pencil, Image as ImageIcon, FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ImageViewer from "../components/shared/ImageViewer";

// IdeaCard component is kept as per instruction to preserve existing code,
// though it is no longer directly used in the ParkingLot's main rendering loop
// after these changes.
function IdeaCard({ idea, onUpdate, theme, allIdeas, specialMode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubIdea, setNewSubIdea] = useState("");
  const subIdeas = allIdeas.filter(i => i.parent_idea_id === idea.id);

  const handleConvertToTask = async (ideaToConvert) => {
    await base44.entities.Task.create({
      title: ideaToConvert.idea,
      status: 'active',
      urgency: 'medium',
      energy_required: 'medium',
      reminder_interval: "30min",
      reminder_count: 0
    });
    await base44.entities.ParkingLotIdea.update(ideaToConvert.id, { converted_to_task: true });
    onUpdate();
  };

  const handleDelete = async (id) => {
    const childIds = allIdeas.filter(i => i.parent_idea_id === id).map(i => i.id);
    for (const childId of childIds) {
        await base44.entities.ParkingLotIdea.delete(childId);
    }
    await base44.entities.ParkingLotIdea.delete(id);
    onUpdate();
  };
  
  const handleAddSubIdea = async (e) => {
      e.preventDefault();
      if(!newSubIdea.trim()) return;
      await base44.entities.ParkingLotIdea.create({
          idea: newSubIdea,
          parent_idea_id: idea.id,
          converted_to_task: false
      });
      setNewSubIdea("");
      onUpdate();
  };

  const categoryColors = {
    work: 'bg-blue-100 text-blue-700',
    personal: 'bg-purple-100 text-purple-700',
    creative: 'bg-pink-100 text-pink-700',
    learning: 'bg-green-100 text-green-700',
    health: 'bg-teal-100 text-teal-700',
    finance: 'bg-amber-100 text-amber-700',
    home: 'bg-orange-100 text-orange-700',
    misc: 'bg-gray-100 text-gray-700'
  };

  return (
    <Card
      className={`border-none shadow-md hover:shadow-lg transition-all ${
        specialMode !== 'normal'
          ? `${specialMode}-card`
          : theme === 'minimalist' 
            ? 'bg-white/90 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-r from-yellow-50/70 to-pink-50/70'
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-start gap-2 mb-2">
              <p className={`font-medium flex-1 ${
                specialMode !== 'normal' ? '' : (theme === 'dark' ? 'text-gray-100' : 'text-gray-900')
              }`}>
                {idea.idea}
              </p>
              {idea.category && (
                <Badge className={categoryColors[idea.category] || categoryColors.misc}>
                  {idea.category}
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {new Date(idea.created_date).toLocaleDateString()}
            </Badge>
          </div>
          <div className="flex gap-1">
            {subIdeas.length > 0 && (
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1"
                >
                    {isExpanded ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
                    <span className="hidden sm:inline">{subIdeas.length}</span>
                </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleConvertToTask(idea)}
              className="flex items-center gap-1"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline">To Task</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(idea.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {isExpanded && (
            <div className="pl-6 pt-4 mt-4 border-t space-y-2">
                {subIdeas.map(subIdea => (
                    <div key={subIdea.id} className={`flex items-center justify-between text-sm p-2 rounded-md ${
                      specialMode !== 'normal'
                        ? 'bg-white/80 backdrop-blur-sm'
                        : theme === 'dark' ? 'bg-gray-900/50' : 'bg-white/50'
                    }`}>
                        <span className={specialMode !== 'normal' ? '' : (theme === 'dark' ? 'text-gray-300' : '')}>
                          {subIdea.idea}
                        </span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-100" onClick={() => handleDelete(subIdea.id)}>
                            <Trash2 className="w-3 h-3"/>
                        </Button>
                    </div>
                ))}
                <form onSubmit={handleAddSubIdea} className="flex gap-2 pt-2">
                    <Input 
                        value={newSubIdea}
                        onChange={(e) => setNewSubIdea(e.target.value)}
                        placeholder="Add a sub-idea..."
                    />
                    <Button type="submit" size="icon" className="flex-shrink-0">
                        <Plus className="w-4 h-4" />
                    </Button>
                </form>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ParkingLot() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCategorizingAll, setIsCategorizingAll] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false); // Renamed from setShowAddModal for consistency
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [microphoneAccessGranted, setMicrophoneAccessGranted] = useState(null); // null, true, false
  const [editingIdea, setEditingIdea] = useState(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("misc");
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [isUploadingPicture, setIsUploadingPicture] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['parkingLotIdeas'],
    queryFn: () => base44.entities.ParkingLotIdea.filter({ converted_to_task: false }, '-created_date'),
    initialData: [],
  });

  const convertToTaskMutation = useMutation({
    mutationFn: async (ideaToConvert) => {
      await base44.entities.Task.create({
        title: ideaToConvert.idea,
        status: 'active',
        urgency: 'medium',
        energy_required: 'medium',
        reminder_interval: "30min",
        reminder_count: 0,
        pictures: ideaToConvert.pictures || [],
        notes: ideaToConvert.notes || ''
      });
      await base44.entities.ParkingLotIdea.update(ideaToConvert.id, { converted_to_task: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    },
  });

  const handleConvertToTask = (ideaToConvert) => {
    convertToTaskMutation.mutate(ideaToConvert);
  };

  const handlePictureUpload = async (ideaId, file) => {
    setIsUploadingPicture(ideaId);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) return;
      
      const updatedPictures = [...(idea.pictures || []), file_url];
      
      // Update database in background
      await base44.entities.ParkingLotIdea.update(ideaId, { pictures: updatedPictures });
      
      // Refetch to get fresh data
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error uploading picture:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploadingPicture(null);
    }
  };

  const handleRemovePicture = async (ideaId, pictureUrl) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    
    const updatedPictures = idea.pictures.filter(p => p !== pictureUrl);
    
    try {
      await base44.entities.ParkingLotIdea.update(ideaId, { pictures: updatedPictures });
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error removing picture:", error);
    }
  };

  const handleNotesUpdate = async (ideaId, notes) => {
    try {
      await base44.entities.ParkingLotIdea.update(ideaId, { notes });
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error updating notes:", error);
    }
  };

  const deleteIdeaMutation = useMutation({
    mutationFn: async (idToDelete) => {
      const childIds = ideas.filter(i => i.parent_idea_id === idToDelete).map(i => i.id);
      for (const childId of childIds) {
        await base44.entities.ParkingLotIdea.delete(childId);
      }
      await base44.entities.ParkingLotIdea.delete(idToDelete);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    },
  });

  const handleDelete = (id) => {
    deleteIdeaMutation.mutate(id);
  };

  const editIdeaMutation = useMutation({
    mutationFn: ({ id, newText, newCategory }) => 
      base44.entities.ParkingLotIdea.update(id, { idea: newText, category: newCategory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
      setShowEditModal(false);
      setEditingIdea(null);
      setEditText("");
      setEditCategory("misc");
    },
  });

  const handleEditIdea = () => {
    if (editingIdea && editText.trim()) {
      editIdeaMutation.mutate({ id: editingIdea.id, newText: editText, newCategory: editCategory });
    }
  };

  const handleCategorizeAll = async () => {
    setIsCategorizingAll(true);
    
    const uncategorized = ideas.filter(i => !i.category && !i.parent_idea_id);
    
    for (const idea of uncategorized) {
      const prompt = `Categorize this brain dump idea into ONE category: "${idea.idea}"

Categories:
- work (job, career, professional tasks)
- personal (relationships, self-improvement, hobbies)
- creative (art, writing, projects)
- learning (education, skills, courses)
- health (fitness, medical, wellness)
- finance (money, budget, investments)
- home (chores, maintenance, organization)
- misc (everything else)

Return ONLY the category name, nothing else.`;

      try {
        const result = await base44.functions.invoke('categorizeIdea', { prompt });
        const response = result?.data?.message;
        const category = response.trim().toLowerCase();
        
        if (['work', 'personal', 'creative', 'learning', 'health', 'finance', 'home', 'misc'].includes(category)) {
          await base44.entities.ParkingLotIdea.update(idea.id, { category });
        }
      } catch (error) {
        console.error('Error categorizing idea:', error);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    setIsCategorizingAll(false);
  };
  
  const topLevelIdeas = ideas.filter(i => !i.parent_idea_id);
  
  const filteredIdeas = topLevelIdeas.filter(idea => {
    const matchesSearch = searchQuery === "" || 
      idea.idea.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || 
      idea.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Group filtered top-level ideas with their sub-ideas
  const groupedIdeas = filteredIdeas.map(parentIdea => ({
    parent: parentIdea,
    subIdeas: ideas.filter(i => i.parent_idea_id === parentIdea.id)
  }));

  const hasUncategorized = topLevelIdeas.some(i => !i.category);

  const handleVoiceRecord = async () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      try {
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/ogg;codecs=opus';
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });
        setMicrophoneAccessGranted(true);
        setIsRecording(true);
        
        const mediaRecorder = new MediaRecorder(stream, { 
          mimeType: mimeType,
          audioBitsPerSecond: 128000
        });
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          const audioBlob = new Blob(chunks, { type: mimeType });
          
          if (audioBlob.size === 0) {
            alert("No audio was recorded. Please try again.");
            setIsRecording(false);
            return;
          }
          
          try {
            let extension = 'webm';
            if (mimeType.includes('mp4')) extension = 'mp4';
            if (mimeType.includes('ogg')) extension = 'ogg';
            
            const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeType });
            
            const uploadResult = await base44.integrations.Core.UploadFile({
              file: audioFile
            });

            if (!uploadResult?.file_url) {
              throw new Error('Failed to upload audio file');
            }

            const result = await base44.functions.invoke('transcribeAudio', {
              file_url: uploadResult.file_url
            });

            const responseData = result?.data || result;
            
            if (responseData?.success && responseData?.transcription) {
              setTextInput(prev => prev + (prev ? ' ' : '') + responseData.transcription);
            } else {
              const errorMsg = responseData?.error || "Failed to transcribe audio. Please try again.";
              alert(errorMsg);
            }
          } catch (error) {
            console.error('Error transcribing audio:', error);
            alert('Failed to transcribe audio. Please try again.');
          }
          setIsRecording(false);
        };
        
        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 10000);
      } catch (error) {
        setMicrophoneAccessGranted(false);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            alert("Microphone access denied. Please enable it in your browser settings.");
        } else {
            alert("Could not access microphone: " + error.message);
        }
      }
    }
  };

  const categoryColors = {
    work: 'bg-blue-100 text-blue-700',
    personal: 'bg-purple-100 text-purple-700',
    creative: 'bg-pink-100 text-pink-700',
    learning: 'bg-green-100 text-green-700',
    health: 'bg-teal-100 text-teal-700',
    finance: 'bg-amber-100 text-amber-700',
    home: 'bg-orange-100 text-orange-700',
    misc: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 max-w-6xl mx-auto pb-0 ${
      theme === 'spicybrains' && specialMode === 'normal'
        ? 'bg-gradient-to-br from-yellow-300 via-purple-300 to-yellow-400'
        : ''
    }`}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Parking Lot 🅿️
          </h1>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Brain dump your ideas here - they're safe until you're ready!
          </p>
        </div>
        <Button
          onClick={() => {
            if (window.triggerEasterEgg) {
              window.triggerEasterEgg('ideas');
            }
          }}
          variant="ghost"
          size="sm"
          className={`text-xs opacity-40 hover:opacity-100 transition-opacity ${
            theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
          }`}
        >
          💡 Too many ideas? 💡
        </Button>
      </div>

      {/* Quick Add Modal */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Add Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className={`text-center text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Type or speak your idea
            </p>

            <div className="flex gap-3">
              <Button
                onClick={handleVoiceRecord}
                variant="outline"
                className={`flex-1 ${isRecording ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : ''}`}
                disabled={microphoneAccessGranted === false}
              >
                <Mic className="w-4 h-4 mr-2" />
                {isRecording ? "Stop Recording" : (microphoneAccessGranted === false ? "Mic Access Denied" : "Record Voice")}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className={`px-2 ${theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-white text-gray-500'}`}>
                  Or
                </span>
              </div>
            </div>

            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="What's on your mind? (Try: 'Add milk to my shopping list')"
              className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}`}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!textInput.trim()) return;
                  
                  // Check if user is trying to add to an existing list
                  const addToListMatch = textInput.toLowerCase().match(/add (.+?) to (?:the |my )?(.+?)(?:\s+list)?$/i);
                  
                  if (addToListMatch) {
                    const [_, itemToAdd, listName] = addToListMatch;
                    
                    // Find matching parent idea
                    const matchingIdea = topLevelIdeas.find(idea => 
                      idea.idea.toLowerCase().includes(listName.toLowerCase().trim())
                    );
                    
                    if (matchingIdea) {
                      // Add as sub-idea to the matched list
                      await base44.entities.ParkingLotIdea.create({
                        idea: itemToAdd.trim(),
                        parent_idea_id: matchingIdea.id,
                        converted_to_task: false
                      });
                      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                      setTextInput("");
                      setShowQuickAdd(false);
                      return;
                    }
                  }
                  
                  // Otherwise create as new idea
                  await base44.entities.ParkingLotIdea.create({
                    idea: textInput,
                    converted_to_task: false,
                    parent_idea_id: null
                  });
                  queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                  setTextInput("");
                  setShowQuickAdd(false);
                  setIsRecording(false);
                  setMicrophoneAccessGranted(null);
                }}
                disabled={!textInput.trim()}
                className={`flex-1 ${theme === 'minimalist'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-gradient-to-r from-yellow-600 to-pink-600'
                }`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Idea
              </Button>
              <Button
                onClick={() => {
                  setTextInput("");
                  setShowQuickAdd(false);
                  setIsRecording(false);
                  setMicrophoneAccessGranted(null);
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showCategoryFilter && topLevelIdeas.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ideas..."
              className="pl-10"
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="md:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="work">Work</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="home">Home</SelectItem>
              <SelectItem value="misc">Miscellaneous</SelectItem>
            </SelectContent>
          </Select>

          {hasUncategorized && (
            <Button
              onClick={handleCategorizeAll}
              disabled={isCategorizingAll}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isCategorizingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Categorizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Categorize
                </>
              )}
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : groupedIdeas.length === 0 ? (
          <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
            specialMode === 'normal' ? (
              theme === 'minimalist'
                ? 'bg-white/90 backdrop-blur-sm'
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-purple-50 to-pink-50' // Empty state specific gradient
            ) : ''
          }`}>
            <CardContent className="p-12 text-center">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                specialMode !== 'normal' ? '' :
                theme === 'minimalist' ? 'bg-purple-100' :
                theme === 'dark' ? 'bg-purple-900/30' :
                'bg-gradient-to-br from-purple-100 to-pink-100'
              }`}>
                <Lightbulb className={`w-8 h-8 ${
                  specialMode !== 'normal' ? '' :
                  theme === 'minimalist' ? 'text-purple-600' :
                  theme === 'dark' ? 'text-purple-400' :
                  'text-purple-600'
                }`} />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${
                specialMode !== 'normal' ? `${specialMode}-title` :
                theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
              }`}>
                No ideas parked yet
              </h3>
              <p className={`mb-6 ${
                specialMode !== 'normal' ? `${specialMode}-text` :
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Got a random thought? Park it here to clear your mind
              </p>
              <Button
                onClick={() => setShowQuickAdd(true)} // Changed from setShowAddModal
                className={
                  specialMode !== 'normal' ? '' :
                  theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Park Your First Idea
              </Button>
            </CardContent>
          </Card>
        ) : (
          groupedIdeas.map((group) => (
            <Card key={group.parent.id} className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
              specialMode === 'normal' ? (
                theme === 'minimalist'
                  ? 'bg-white/90 backdrop-blur-sm'
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50' // Ideas list specific gradient
              ) : ''
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className={`w-5 h-5 ${
                        specialMode !== 'normal' ? '' :
                        theme === 'minimalist' ? 'text-purple-600' :
                        theme === 'dark' ? 'text-purple-400' :
                        'text-purple-600'
                      }`} />
                      <h3 className={`font-semibold text-lg whitespace-pre-wrap ${
                        specialMode !== 'normal' ? `${specialMode}-title` :
                        theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {group.parent.idea}
                      </h3>
                    </div>
                    {group.parent.category && (
                      <Badge className={categoryColors[group.parent.category] || categoryColors.misc}>
                        {group.parent.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2">
                        <div className="space-y-1">
                          <button
                            onClick={() => handleConvertToTask(group.parent)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Convert to Task
                          </button>
                          <button
                            onClick={() => {
                              setEditingIdea(group.parent);
                              setEditText(group.parent.idea);
                              setEditCategory(group.parent.category || "misc");
                              setShowEditModal(true);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          <div className="border-t my-1" />
                          <div className="px-3 py-1 text-xs font-semibold text-gray-500">Format</div>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'plain' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            Plain Text
                          </button>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'checkbox' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            ☑️ Checklist
                          </button>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'numbered' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            🔢 Numbered List
                          </button>
                          <div className="border-t my-1" />
                          <button
                            onClick={() => handleDelete(group.parent.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 rounded flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {group.subIdeas.length > 0 && (
                  <div className="ml-6 space-y-2 mt-4">
                    {group.subIdeas.map((subIdea, index) => {
                      const format = group.parent.list_format || 'plain';
                      const checkedItems = group.parent.checked_items || [];
                      const isChecked = checkedItems.includes(index);
                      
                      return (
                        <div key={subIdea.id} className={`flex items-start justify-between p-3 rounded-lg ${
                          theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'
                        }`}>
                          <div className="flex items-start gap-2 flex-1">
                            {format === 'checkbox' ? (
                              <>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={async () => {
                                    const newCheckedItems = isChecked
                                      ? checkedItems.filter(i => i !== index)
                                      : [...checkedItems, index];
                                    await base44.entities.ParkingLotIdea.update(group.parent.id, {
                                      checked_items: newCheckedItems
                                    });
                                    queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                                  }}
                                  className="mt-0.5 rounded cursor-pointer"
                                />
                                <p className={`flex-1 text-sm ${
                                  isChecked ? 'line-through text-gray-400' : ''
                                } ${
                                  specialMode !== 'normal' ? `${specialMode}-text` :
                                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  {subIdea.idea}
                                </p>
                              </>
                            ) : format === 'numbered' ? (
                              <p className={`flex-1 text-sm ${
                                specialMode !== 'normal' ? `${specialMode}-text` :
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                {index + 1}. {subIdea.idea}
                              </p>
                            ) : (
                              <p className={`flex-1 text-sm ${
                                specialMode !== 'normal' ? `${specialMode}-text` :
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                • {subIdea.idea}
                              </p>
                            )}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6">
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2">
                              <div className="space-y-1">
                                <button
                                  onClick={() => handleConvertToTask(subIdea)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Convert to Task
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingIdea(subIdea);
                                    setEditText(subIdea.idea);
                                    setEditCategory(subIdea.category || "misc");
                                    setShowEditModal(true);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                                >
                                  <Pencil className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(subIdea.id)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 rounded flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })}
                    
                    {/* Manual add to list */}
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const input = e.target.elements.subidea.value;
                      if (!input.trim()) return;
                      await base44.entities.ParkingLotIdea.create({
                        idea: input.trim(),
                        parent_idea_id: group.parent.id,
                        converted_to_task: false
                      });
                      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                      e.target.reset();
                    }} className="flex gap-2">
                      <Input
                        name="subidea"
                        placeholder="Add item to this list..."
                        className="flex-1 h-9 text-sm"
                      />
                      <Button type="submit" size="icon" className="h-9 w-9 flex-shrink-0">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                )}

                {/* Pictures */}
                {group.parent.pictures && group.parent.pictures.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {group.parent.pictures.map((pic, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={pic}
                          alt="Idea attachment"
                          className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setViewingImage(pic)}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePicture(group.parent.id, pic);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes Section */}
                {expandedNotes[group.parent.id] && (
                  <div className="mt-4">
                    <Textarea
                      defaultValue={group.parent.notes || ''}
                      onBlur={(e) => handleNotesUpdate(group.parent.id, e.target.value)}
                      placeholder="Add notes..."
                      className="text-sm min-h-[80px]"
                    />
                  </div>
                )}
                {group.parent.notes && !expandedNotes[group.parent.id] && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${
                    theme === 'dark' ? 'bg-gray-900/50 text-gray-300' : 'bg-gray-50 text-gray-700'
                  }`}>
                    {group.parent.notes}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                  <label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePictureUpload(group.parent.id, file);
                      }}
                      className="hidden"
                      disabled={isUploadingPicture === group.parent.id}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isUploadingPicture === group.parent.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.currentTarget.previousElementSibling?.click();
                      }}
                    >
                      {isUploadingPicture === group.parent.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </Button>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedNotes({
                      ...expandedNotes,
                      [group.parent.id]: !expandedNotes[group.parent.id]
                    })}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Idea Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Edit Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Edit your idea"
              className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}`}
              autoFocus
            />
            <Select value={editCategory} onValueChange={setEditCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Work</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="creative">Creative</SelectItem>
                <SelectItem value="learning">Learning</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="misc">Miscellaneous</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowEditModal(false);
                setEditingIdea(null);
                setEditText("");
                setEditCategory("misc");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleEditIdea} disabled={!editText.trim() || editIdeaMutation.isLoading}>
              {editIdeaMutation.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageViewer
        imageUrl={viewingImage}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />

      <div style={{ paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }} aria-hidden="true"></div>
    </div>
  );
}