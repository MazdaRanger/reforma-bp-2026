declare module 'react' {
    export function useState<T>(initialState?: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
    export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
    export function useMemo<T>(factory: () => T, deps: any[] | undefined): T;
    export function useRef<T>(initialValue: T): { current: T };
    export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
    export function useContext<T>(context: any): T;
    export function createContext<T>(defaultValue: T): any;
    
    export type FC<P = {}> = (props: P & { children?: any }) => any;
    export type ReactNode = any;
    export type FormEvent<T = any> = any;
    export type KeyboardEvent<T = any> = any;
    export type ChangeEvent<T = any> = any;
    export type MouseEvent<T = any> = any;
    
    function React(): any;
    namespace React {
        type FC<P = {}> = (props: P & { children?: any }) => any;
        type ReactNode = any;
        type FormEvent<T = any> = any;
        type KeyboardEvent<T = any> = any;
        type ChangeEvent<T = any> = any;
        type MouseEvent<T = any> = any;
    }
    
    export default React;
}

declare global {
    namespace JSX {
        interface Element {}
        interface IntrinsicElements {
            [elemName: string]: any;
        }
        interface ElementChildrenAttribute {
            children: {};
        }
    }
}

declare module 'firebase/firestore' {
    export const doc: any;
    export const updateDoc: any;
    export const serverTimestamp: any;
    export const arrayUnion: any;
    export const collection: any;
    export const query: any;
    export const where: any;
    export const getDocs: any;
    export const setDoc: any;
    export const addDoc: any;
    export const deleteDoc: any;
    export const getDoc: any;
    export const onSnapshot: any;
    export const orderBy: any;
    export const limit: any;
    export const writeBatch: any;
    export const Timestamp: any;
}

declare module '*';
