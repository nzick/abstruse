import { Component, OnInit, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';
import { format, distanceInWordsToNow } from 'date-fns';

@Component({
  selector: 'app-builds',
  templateUrl: 'app-builds.component.html'
})
export class AppBuildsComponent implements OnInit {
  loading: boolean;
  builds: any[];

  constructor(
    private socketService: SocketService,
    private apiService: ApiService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.builds = [];
    this.loading = true;
  }

  ngOnInit() {
    this.fetch();

    this.socketService.outputEvents.subscribe(event => {
      if (!this.builds || !event.data) {
        return;
      }

      if (event.data === 'jobAdded') {
        this.fetch();
      }

      const index = this.builds.findIndex(build => build.id === event.build_id);
      if (index !== -1) {
        const jobIndex = this.builds[index].jobs.findIndex(job => job.id === event.job_id);
        if (jobIndex !== -1) {
          let status = null;
          switch (event.data) {
            case 'jobSucceded':
              status = 'success';
            break;
            case 'jobQueued':
              status = 'queued';
            break;
            case 'jobStarted':
              status = 'running';
            break;
            case 'jobFailed':
              status = 'failed';
            break;
            case 'jobStopped':
              status = 'failed';
            break;
          }

          this.builds[index].jobs[jobIndex].status = status;
        }
      }
    });
  }

  fetch(): void {
    this.apiService.getBuilds().subscribe(builds => {
      this.builds = builds;
      this.updateJobs();
      setInterval(() => this.updateJobs(), 1000);

      this.loading = false;
    });
  }

  updateJobs(): void {
    let currentTime = new Date().getTime() - this.socketService.timeSyncDiff;

    this.builds = this.builds
      .map(build => {
        build.jobs = build.jobs.map(job => {
          if (!job.end_time || job.status === 'running') {
            job.time = format(currentTime - job.start_time, 'mm:ss');
          } else {
            job.time = format(job.end_time - job.start_time, 'mm:ss');
          }
          return job;
        });

        build.totalTime = format(Math.max(...build.jobs.map(job => {
          let date = new Date();
          let splitted = job.time.split(':');
          date.setUTCMinutes(splitted[0]);
          date.setUTCSeconds(splitted[1]);
          return date;
        })), 'mm:ss');

        return build;
      })
      .map(build => {
        let status = 'queued';
        if (build.jobs.findIndex(job => job.status === 'failed') !== -1) {
          status = 'failed';
        }

        if (build.jobs.findIndex(job => job.status === 'running') !== -1) {
          status = 'running';
        }

        if (build.jobs.length === build.jobs.filter(job => job.status === 'success').length) {
          status = 'success';
        }

        build.status = status;
        build.timeInWords = distanceInWordsToNow(build.created_at);
        return build;
      });
  }

  restartBuild(id: number): void {
    this.socketService.emit({ type: 'restartBuild', data: id });
  }

  gotoBuild(buildId: number) {
    this.router.navigate(['build', buildId]);
  }
}
