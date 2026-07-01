import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface OnboardingProps {
  onComplete?: () => void;
}

export default function BandOnboarding({ onComplete }: OnboardingProps) {
  const [bandName, setBandName] = useState('');
  const [streetAddress, setStreetAddress] = useState(''); // ◄ Added for actual venue/street name
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in to register a band.");

      // 1. Clean the postcode and fetch coordinates from the UK API
      const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
      const geoResponse = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
      
      let latValue: number | null = null;
      let lngValue: number | null = null;

      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        // Force conversion to floating-point numbers to appease PostgreSQL
        latValue = geoData.result.latitude ? parseFloat(geoData.result.latitude) : null;
        lngValue = geoData.result.longitude ? parseFloat(geoData.result.longitude) : null;
      }

      // 2. Combine street address and postcode into one clean text string
      const fullAddress = `${streetAddress}, ${postcode.toUpperCase()}`;

      // 3. Save the clean data to the Supabase 'bands' table
      const { error } = await supabase
        .from('bands')
        .insert([
          {
            name: bandName,
            bandroom_address: fullAddress, // Text string goes to text column
            latitude: latValue,            // Double precision float or null
            longitude: lngValue,           // Double precision float or null
            manager_id: user.id
          }
        ]);

      if (error) throw error;

      setMessage('🎺 Band registered successfully!');
      
      if (onComplete) {
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
      
    } catch (error: any) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      maxWidth: '450px', 
      margin: '80px auto', 
      padding: '30px', 
      fontFamily: 'sans-serif',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ marginTop: 0 }}>Set Up Your Band Profile</h2>
      <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
        Welcome to BrassBandwidth! Before accessing your dashboard, please enter your ensemble details. Your location data is used quietly in the background to calculate distances for regional spares.
      </p>
      
      <form onSubmit={handleOnboarding} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>Band / Ensemble Name</label>
          <input 
            type="text" 
            required 
            placeholder="e.g., City Brass Ensemble"
            value={bandName}
            onChange={(e) => setBandName(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        {/* 🏢 Street Address Input */}
<div>
  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>Bandroom / Rehearsal Venue Address</label>
  <input 
    type="text" 
    required 
    placeholder="e.g., St. John's Community Centre, High St"
    value={streetAddress}
    onChange={(e) => setStreetAddress(e.target.value)}
    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
  />
</div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>Postcode</label>
          <input 
            type="text" 
            required 
            placeholder="e.g., M1 1AG"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '12px', 
            backgroundColor: '#0070f3', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '15px',
            marginTop: '8px'
          }}
        >
          {loading ? 'Saving Profile...' : 'Save and Open Dashboard 🚀'}
        </button>
      </form>

      {message && (
        <p style={{ 
          marginTop: '20px', 
          padding: '10px', 
          borderRadius: '4px', 
          backgroundColor: message.includes('❌') ? '#fff0f0' : '#f0fff4',
          color: message.includes('❌') ? '#c00' : '#008000',
          fontWeight: 'bold',
          textAlign: 'center',
          fontSize: '14px'
        }}>
          {message}
        </p>
      )}
    </div>
  );
}