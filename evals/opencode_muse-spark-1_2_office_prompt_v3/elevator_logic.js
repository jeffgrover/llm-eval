(function(root){
    const STATE = { IDLE:'IDLE', MOVING:'MOVING', DOOR_OPENING:'DOOR_OPENING', DOOR_OPEN:'DOOR_OPEN', DOOR_CLOSING:'DOOR_CLOSING' };
    class ElevatorLogic{
        constructor(opts){
            opts = opts||{};
            this.floorCount = opts.floorCount!==undefined?opts.floorCount:6;
            this.maxCapacity = opts.maxCapacity!==undefined?opts.maxCapacity:4;
            this.floorHeight = opts.floorHeight!==undefined?opts.floorHeight:3.4;
            this.MIN_DOOR_OPEN_S = 1.2;
            this.MAX_DOOR_OPEN_S = 8;
            this.DOOR_TRANSIT_S = 0.45;
            this.speed = 1.2;
            this.currentFloor = 0;
            this.pos = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.state = STATE.IDLE;
            this.doorTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(this.maxCapacity).fill(false);
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
        }
        callUp(floor){ if(floor>=0&&floor<this.floorCount-1) this.upCalls.add(floor); }
        callDown(floor){ if(floor>0&&floor<this.floorCount) this.downCalls.add(floor); }
        pressDestination(floor){ if(floor>=0&&floor<this.floorCount) this.destinations.add(floor); }
        isAcceptingAt(floor, direction){
            if(this.state!==STATE.DOOR_OPEN) return false;
            if(this.currentFloor!==floor) return false;
            if(this.currentCapacityFree()<=0) return false;
            if(this.passengers.size===0 && this.destinations.size===0) return true;
            if(this.direction===0) return true;
            if(direction===this.direction) return true;
            if(!this._hasWorkInDir(this.direction)) return true;
            return false;
        }
        currentCapacityFree(){ return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size); }
        reserveBoardingSpot(person){
            if(this.currentCapacityFree()<=0) return null;
            let idx=-1;
            for(let i=0;i<this.maxCapacity;i++){ if(!this.spotOccupancy[i]){ idx=i; break; } }
            if(idx===-1) return null;
            this.spotOccupancy[idx]=true;
            this.pendingBoarders.add(person);
            const cols=2;
            const row=Math.floor(idx/cols);
            const col=idx%cols;
            const x=(col===0?-0.6:0.6);
            const z=(row===0?-0.6:0.6);
            const y=0.05;
            return {index:idx,x:x,y:y,z:z};
        }
        completeBoard(person){
            if(this.pendingBoarders.has(person)) this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
        registerDisembark(person){
            if(this.passengers.has(person)) this.pendingDisembark.add(person);
        }
        completeDisembark(person){
            if(this.pendingDisembark.has(person)) this.pendingDisembark.delete(person);
            if(this.passengers.has(person)) this.passengers.delete(person);
            if(person && person._elevatorSpotIndex!==undefined && person._elevatorSpotIndex>=0){
                this.spotOccupancy[person._elevatorSpotIndex]=false;
            } else {
                for(let i=0;i<this.maxCapacity;i++){
                    if(this.spotOccupancy[i]){
                        // fallback: free one if orphan
                    }
                }
            }
        }
        reset(){
            this.upCalls.clear(); this.downCalls.clear(); this.destinations.clear();
            this.passengers.clear(); this.pendingBoarders.clear(); this.pendingDisembark.clear();
            this.spotOccupancy.fill(false);
            this.direction=0; this.targetFloor=0; this.currentFloor=0; this.pos=0;
            this.state=STATE.IDLE; this.doorTimer=0;
            this.servedThisDoorCycle=false; this.lastServedFloor=-1;
        }
        _hasWorkInDir(dir){
            if(dir===1){
                for(let f=this.currentFloor+1;f<this.floorCount;f++){ if(this.destinations.has(f)) return true; if(this.upCalls.has(f)||this.downCalls.has(f)) return true; }
            } else if(dir===-1){
                for(let f=this.currentFloor-1;f>=0;f--){ if(this.destinations.has(f)) return true; if(this.upCalls.has(f)||this.downCalls.has(f)) return true; }
            }
            return false;
        }
        _chooseNextTarget(){
            if(this.destinations.size===0 && this.upCalls.size===0 && this.downCalls.size===0) return null;
            // passenger destinations outrank same-floor hall calls
            if(this.passengers.size>0 && this.destinations.size>0){
                // prefer destinations in current direction
                if(this.direction!==0){
                    let best=null; let bestDist=1e9;
                    this.destinations.forEach((f)=>{
                        if((this.direction===1 && f>this.currentFloor)||(this.direction===-1 && f<this.currentFloor)){
                            let d=Math.abs(f-this.currentFloor);
                            if(d<bestDist){ bestDist=d; best=f; }
                        }
                    });
                    if(best!==null) return best;
                    // no dest ahead, try opposite
                    best=null; bestDist=1e9;
                    this.destinations.forEach((f)=>{
                        let d=Math.abs(f-this.currentFloor);
                        if(d<bestDist && f!==this.currentFloor){ bestDist=d; best=f; }
                    });
                    if(best!==null) return best;
                } else {
                    let best=null; let bestDist=1e9;
                    this.destinations.forEach((f)=>{
                        let d=Math.abs(f-this.currentFloor);
                        if(d<bestDist && f!==this.currentFloor){ bestDist=d; best=f; }
                    });
                    if(best!==null) return best;
                }
            }
            if(this.direction!==0){
                let aheadDest=null; let aheadDist=1e9;
                this.destinations.forEach((f)=>{
                    if((this.direction===1 && f>this.currentFloor)||(this.direction===-1 && f<this.currentFloor)){
                        let d=Math.abs(f-this.currentFloor);
                        if(d<aheadDist){ aheadDist=d; aheadDest=f; }
                    }
                });
                let aheadCall=null; let aheadCallDist=1e9;
                for(let f=this.currentFloor+1;f<this.floorCount;f++){
                    if(this.direction===1 && (this.upCalls.has(f)||this.downCalls.has(f))){
                        let d=f-this.currentFloor; if(d<aheadCallDist){ aheadCallDist=d; aheadCall=f; }
                    }
                }
                for(let f=this.currentFloor-1;f>=0;f--){
                    if(this.direction===-1 && (this.upCalls.has(f)||this.downCalls.has(f))){
                        let d=this.currentFloor-f; if(d<aheadCallDist){ aheadCallDist=d; aheadCall=f; }
                    }
                }
                let candidate=null;
                if(aheadDest!==null && aheadCall!==null) candidate = aheadDist<=aheadCallDist? aheadDest: aheadCall;
                else if(aheadDest!==null) candidate=aheadDest;
                else if(aheadCall!==null) candidate=aheadCall;
                if(candidate!==null) return candidate;
                // reverse
                let behindDest=null; let behindDist=1e9;
                this.destinations.forEach((f)=>{
                    if(f!==this.currentFloor){
                        let d=Math.abs(f-this.currentFloor);
                        if(d<behindDist){ behindDist=d; behindDest=f; }
                    }
                });
                let behindCall=null; let behindCallDist=1e9;
                for(let f=0;f<this.floorCount;f++){
                    if(f===this.currentFloor) continue;
                    if(this.upCalls.has(f)||this.downCalls.has(f)){
                        let d=Math.abs(f-this.currentFloor);
                        if(d<behindCallDist){ behindCallDist=d; behindCall=f; }
                    }
                }
                if(behindDest!==null && behindCall!==null) candidate = behindDist<=behindCallDist? behindDest: behindCall;
                else if(behindDest!==null) candidate=behindDest;
                else if(behindCall!==null) candidate=behindCall;
                return candidate;
            } else {
                let best=null; let bestDist=1e9;
                this.destinations.forEach((f)=>{
                    if(f===this.currentFloor) return;
                    let d=Math.abs(f-this.currentFloor);
                    if(d<bestDist){ bestDist=d; best=f; }
                });
                let bestCall=null; let bestCallDist=1e9;
                for(let f=0;f<this.floorCount;f++){
                    if(f===this.currentFloor) continue;
                    if(this.upCalls.has(f)||this.downCalls.has(f)){
                        let d=Math.abs(f-this.currentFloor);
                        if(d<bestCallDist){ bestCallDist=d; bestCall=f; }
                    }
                }
                if(best!==null && bestCall!==null) return bestDist<=bestCallDist?best:bestCall;
                if(best!==null) return best;
                if(bestCall!==null) return bestCall;
                // same floor call but idle: serve it (need to open doors)
                if(this.upCalls.has(this.currentFloor)||this.downCalls.has(this.currentFloor)||this.destinations.has(this.currentFloor)) return this.currentFloor;
                return null;
            }
        }
        _clearArrival(floor){
            this.destinations.delete(floor);
            if(this.direction===1) this.upCalls.delete(floor);
            else if(this.direction===-1) this.downCalls.delete(floor);
            else { this.upCalls.delete(floor); this.downCalls.delete(floor); }
            if(!this._hasWorkInDir(this.direction)){
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
        }
        tick(dt){
            if(dt<=0) return;
            if(this.state===STATE.IDLE){
                let target=this._chooseNextTarget();
                if(target!==null){
                    if(target===this.currentFloor){
                        this.state=STATE.DOOR_OPENING; this.doorTimer=0; this.servedThisDoorCycle=false;
                    } else {
                        this.targetFloor=target;
                        this.direction = target>this.currentFloor?1:-1;
                        this.state=STATE.MOVING;
                    }
                }
            } else if(this.state===STATE.MOVING){
                // re-evaluate closer stop
                let closer=null; let closerDist=Math.abs(this.targetFloor - this.pos);
                let candidates=[];
                this.destinations.forEach((f)=>{ candidates.push(f); });
                if(this.direction===1){
                    for(let f=Math.ceil(this.pos)+1;f<this.floorCount;f++) if(this.upCalls.has(f)||this.downCalls.has(f)) candidates.push(f);
                    // also upCalls at current? handled at arrival
                } else if(this.direction===-1){
                    for(let f=Math.floor(this.pos)-1;f>=0;f--) if(this.upCalls.has(f)||this.downCalls.has(f)) candidates.push(f);
                }
                for(let i=0;i<candidates.length;i++){
                    let f=candidates[i];
                    if(this.direction===1 && f>this.pos && f<this.targetFloor && f>Math.floor(this.pos)){
                        let d=Math.abs(f-this.pos);
                        if(d<closerDist){ closerDist=d; closer=f; }
                    }
                    if(this.direction===-1 && f<this.pos && f>this.targetFloor){
                        let d=Math.abs(f-this.pos);
                        if(d<closerDist){ closerDist=d; closer=f; }
                    }
                }
                if(closer!==null) this.targetFloor=closer;
                let diff=this.targetFloor - this.pos;
                let step=this.direction*this.speed*dt;
                if(Math.abs(diff)<=Math.abs(step)+0.001){
                    this.pos=this.targetFloor;
                    this.currentFloor=this.targetFloor;
                    this._clearArrival(this.currentFloor);
                    this.state=STATE.DOOR_OPENING; this.doorTimer=0; this.servedThisDoorCycle=true; this.lastServedFloor=this.currentFloor;
                } else {
                    this.pos+=step;
                    // update currentFloor approx
                    this.currentFloor=Math.round(this.pos);
                    if(this.currentFloor<0) this.currentFloor=0;
                    if(this.currentFloor>=this.floorCount) this.currentFloor=this.floorCount-1;
                }
            } else if(this.state===STATE.DOOR_OPENING){
                this.doorTimer+=dt;
                if(this.doorTimer>=this.DOOR_TRANSIT_S){
                    this.state=STATE.DOOR_OPEN; this.doorTimer=0;
                    if(this.upCalls.has(this.currentFloor)||this.downCalls.has(this.currentFloor)||this.destinations.has(this.currentFloor)){
                        this._clearArrival(this.currentFloor);
                    }
                }
            } else if(this.state===STATE.DOOR_OPEN){
                this.doorTimer+=dt;
                let pending = this.pendingBoarders.size>0 || this.pendingDisembark.size>0;
                if(pending && this.doorTimer < this.MAX_DOOR_OPEN_S){
                    if(this.doorTimer < this.MIN_DOOR_OPEN_S) return;
                    return;
                }
                if(this.doorTimer < this.MIN_DOOR_OPEN_S) return;
                if(this.doorTimer >= this.MAX_DOOR_OPEN_S){
                    // force close
                }
                // guard: same floor cannot reopen indefinitely while destinations exist
                if(this.passengers.size>0 && this.destinations.size>0 && (this.upCalls.has(this.currentFloor)||this.downCalls.has(this.currentFloor))){
                    if(this.servedThisDoorCycle && this.lastServedFloor===this.currentFloor){
                        // keep queued but not reopen
                    }
                }
                this.state=STATE.DOOR_CLOSING; this.doorTimer=0;
            } else if(this.state===STATE.DOOR_CLOSING){
                this.doorTimer+=dt;
                if(this.doorTimer>=this.DOOR_TRANSIT_S){
                    this.servedThisDoorCycle=false;
                    let next=this._chooseNextTarget();
                    if(next===null){
                        this.state=STATE.IDLE; this.direction=0;
                    } else if(next===this.currentFloor){
                        // no full-car lobby starvation guard: if full or has destinations, don't reopen same floor
                        if(this.passengers.size>0 && this.destinations.size>0){
                            // find alternative above/below
                            let alt=null;
                            let bestDist=1e9;
                            this.destinations.forEach((f)=>{
                                if(f!==this.currentFloor){
                                    let d=Math.abs(f-this.currentFloor);
                                    if(d<bestDist){ bestDist=d; alt=f; }
                                }
                            });
                            if(alt!==null){
                                this.targetFloor=alt; this.direction=alt>this.currentFloor?1:-1; this.state=STATE.MOVING;
                            } else {
                                this.state=STATE.IDLE; this.direction=0;
                            }
                        } else if(this.currentCapacityFree()<=0){
                            // car full, prioritize moving away
                            let alt=null;
                            for(let f=this.currentFloor+1;f<this.floorCount;f++) if(this.destinations.has(f)){ alt=f; break; }
                            if(alt!==null){ this.targetFloor=alt; this.direction=1; this.state=STATE.MOVING; }
                            else { this.state=STATE.IDLE; }
                        } else {
                            this.state=STATE.DOOR_OPENING; this.doorTimer=0;
                        }
                    } else {
                        this.targetFloor=next;
                        this.direction = next>this.currentFloor?1:-1;
                        this.state=STATE.MOVING;
                    }
                }
            }
        }
    }
    root.ElevatorLogic=ElevatorLogic;
    if(typeof module!=="undefined" && module.exports){ module.exports={ElevatorLogic:ElevatorLogic}; }
})(typeof window!=="undefined"?window:globalThis);
