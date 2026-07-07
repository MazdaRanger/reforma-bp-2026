import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db, JOBS_COLLECTION } from '../services/firebase';
import { Job } from '../types';

export const useJobs = (user: any) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Filter out jobs where isDeleted == true
    // Note: If you have old data without isDeleted field, this query might need an index or composite index
    // For simplicity without index, we can filter client side, but 'where' is better.
    // However, 'where' excludes docs missing the field in some firestore versions depending on query type.
    // Let's do client side filtering to be safe without index deployment for now, OR simply query all.
    // Ideally: query(collection(db, JOBS_COLLECTION), where("isDeleted", "!=", true));
    
    const q = query(collection(db, JOBS_COLLECTION));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const jobsData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Job))
            .filter(job => !job.isDeleted); // Client-side filtering for soft delete
        
        jobsData.sort((a, b) => {
            const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        setJobs(jobsData);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        setError("Gagal memuat data. Periksa koneksi internet atau izin database.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { jobs, loading, error };
};