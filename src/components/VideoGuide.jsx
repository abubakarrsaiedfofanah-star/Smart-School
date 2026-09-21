import { useEffect, useRef, useState } from 'react'

const guides={
  'School Admin':[['Welcome, School Admin','Register your school and create the first administrator account.','School registration'],['1. Add school details','Enter the school name, contact details and school level.','School details'],['2. Choose a plan','Select Starter, Professional or Enterprise for your school.','Plan'],['3. Open the school dashboard','After activation, add teachers, students and parents from your dashboard.','School dashboard']],
  Teacher:[['Welcome, Teacher','Your school administrator creates your teacher account.','Teacher portal'],['1. Get your school invite','Ask your School Admin to add your name and email.','School invitation'],['2. Open your portal','Sign in to manage classes, attendance, assignments and results.','Teacher dashboard']],
  Student:[['Welcome, Student','Your school creates your student account and gives you access.','Student portal'],['1. Receive your account','Ask your School Admin or teacher for your sign-in details.','School access'],['2. Follow your learning','Use your portal for assignments, grades, fees and results.','Student dashboard']],
  Parent:[['Welcome, Parent','Your school links your account to your child.','Parent portal'],['1. Get your invite','Ask the School Admin to add your email and child connection.','Parent invitation'],['2. Stay informed','Use your portal for progress, payments, events and messages.','Parent dashboard']],
}

export default function VideoGuide({role='School Admin'}){
  const chapters=guides[role]||guides['School Admin']
  const videoRef=useRef(null)
  const [chapter,setChapter]=useState(0),[playing,setPlaying]=useState(false),[voice,setVoice]=useState(false),[voiceAvailable,setVoiceAvailable]=useState(true)
  useEffect(()=>{if(!playing)return undefined;const timer=setInterval(()=>setChapter(current=>current===chapters.length-1?0:current+1),4000);return()=>clearInterval(timer)},[playing])
  const speakChapter=current=>{if(!('speechSynthesis' in window)){setVoiceAvailable(false);return}const speech=new SpeechSynthesisUtterance(`${chapters[current][0]}. ${chapters[current][1]}`);speech.rate=.92;speech.pitch=1;window.speechSynthesis.cancel();window.speechSynthesis.speak(speech)}
  useEffect(()=>{if(voice&&playing)speakChapter(chapter);return()=>{if('speechSynthesis' in window)window.speechSynthesis.cancel()}},[chapter,playing,voice])
  const current=chapters[chapter]
  const toggleGuide=async()=>{if(playing){videoRef.current?.pause();setPlaying(false);if('speechSynthesis' in window)window.speechSynthesis.cancel();return}setPlaying(true);setVoice(true);try{await videoRef.current?.play();speakChapter(chapter)}catch{setPlaying(false)}}
  const toggleVoice=()=>{const next=!voice;setVoice(next);if(!next&&'speechSynthesis' in window)window.speechSynthesis.cancel();if(next){if(!playing)toggleGuide();else speakChapter(chapter)}}
  const nextChapter=()=>{const next=chapter===chapters.length-1?0:chapter+1;setChapter(next);if(voice&&playing)speakChapter(next)}
  return <div className="video-guide-wrapper">
    <div className="system-guide" aria-label="SmartSchool guide video">
      <div className="guide-window-bar">
        <span/><span/><span/>
        <b>{role} Setup Guide</b>
      </div>
      <div className="guide-video-stage">
        <video ref={videoRef} muted loop playsInline controls preload="metadata" poster="https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg?auto=compress&cs=tinysrgb&w=1200" onPlay={()=>{setPlaying(true);setVoice(true);speakChapter(chapter)}} onPause={()=>{setPlaying(false);if('speechSynthesis' in window)window.speechSynthesis.cancel()}}>
          <source src="/videos/registration-guide.mp4" type="video/mp4"/>
        </video>
        <div className="guide-caption-overlay">
          <small>CHAPTER {chapter+1} OF {chapters.length}</small>
          <strong>{current[0]}</strong>
          <p>{current[1]}</p>
        </div>
        <div className="guide-progress-bar"><i style={{width:`${((chapter+1)/chapters.length)*100}%`}}/></div>
      </div>
      <div className="guide-controls">
        <button type="button" className="button blue-button" onClick={toggleGuide}>{playing?'Pause':'Play Guide'}</button>
        <button type="button" className="button outline-button" onClick={nextChapter}>Next Step →</button>
        <button type="button" className={'guide-voice-btn '+(voice?'on':'')} onClick={toggleVoice}>{voice?'🔊 Voice On':'🔈 Voice Off'}</button>
      </div>
    </div>
    <div className="guide-footer-info">
      <b>{current[2]}</b>
      <span>Follow the directions on screen</span>
    </div>
  </div>
}