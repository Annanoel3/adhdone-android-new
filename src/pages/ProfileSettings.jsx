import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User as UserIcon, Upload, Loader2, Save, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { User } from "@/entities/User";
import { UploadFile } from "@/integrations/Core";

export default function ProfileSettings() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadUser();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      setDisplayName(currentUser.display_name || "");
      setBio(currentUser.bio || "");
      setProfilePicture(currentUser.profile_picture_url || "");
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setProfilePicture(file_url);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image");
    }
    setIsUploading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await User.updateMyUserData({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        profile_picture_url: profilePicture || null
      });
      alert("Profile updated successfully!");
      loadUser();
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile");
    }
    setIsSaving(false);
  };

  if (!user) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/settings')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px', padding: '12px 16px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', color: theme === 'dark' ? '#e5e7eb' : '#1f2937' }}
      >
        ← Back
      </button>
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Profile Settings
        </h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Customize how you appear to others
        </p>
      </div>

      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white/90 backdrop-blur-sm'
      }`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
            <UserIcon className="w-5 h-5" />
            Public Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Picture */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-32 h-32">
              {profilePicture ? (
                <AvatarImage src={profilePicture} alt="Profile" className="object-cover" />
              ) : (
                <AvatarFallback className="text-4xl">
                  {user.full_name?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              )}
            </Avatar>
            
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="profile-picture-upload"
                disabled={isUploading}
              />
              <label htmlFor="profile-picture-upload">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => document.getElementById('profile-picture-upload').click()}
                  className="cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      Change Photo
                    </>
                  )}
                </Button>
              </label>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
              Display Name
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we call you?"
              maxLength={50}
            />
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              This is how you'll appear to accountability partners
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
              Bio
            </Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others a bit about yourself..."
              className="h-24"
              maxLength={200}
            />
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {bio.length}/200 characters
            </p>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
              Email
            </Label>
            <Input
              value={user.email}
              disabled
              className={theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-gray-100 text-gray-600'}
            />
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Your email cannot be changed
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full ${
              theme === 'minimalist' 
                ? 'bg-green-600 hover:bg-green-700' 
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Profile
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}