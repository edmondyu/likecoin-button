import {
  LIKE_CO_HOSTNAME,
} from '@/constant';

import { getAvatarHaloTypeFromUser } from '~/util/user';
import { isAndroid, isFacebookBrowser } from '~/util/client';
import {
  apiPostLikeButtonReadEvent,
} from '~/util/api/api';

import mixin from './embed';

const READ_TIMEOUT = 10000;

export default {
  mixins: [mixin],
  data() {
    return {
      isUserFetched: false,
      isDisplayed: false,
      isReadTimerEnded: false,
      readTimer: null,
    };
  },
  computed: {
    popupLikeURL() {
      return `/in/like/${this.id}/?referrer=${encodeURIComponent(this.referrer)}`;
    },
    isPreview() {
      return this.$route.name.endsWith('-preview');
    },
  },
  head() {
    const link = [];
    if (this.isUserFetched && !this.isLoggedIn) {
      if (this.hasCookieSupport) {
        if (!(window.doNotTrack || navigator.doNotTrack)) { // do not prefetch if DNT
          link.push({ rel: 'prefetch', href: this.signInURL });
        }
      } else {
        link.push({ rel: 'prefetch', href: this.popupLikeURL });
      }
    }
    return {
      link,
    };
  },
  async mounted() {
    window.addEventListener('message', this.handleWindowMessage);
    if (this.isPreview) return;
    this.readTimer = setTimeout(() => {
      this.isReadTimerEnded = true;
    }, READ_TIMEOUT);
    this.hasCookieSupport = await this.getIsCookieSupport();
    await this.updateUserSignInStatus();
    if (this.onCheckCookieSupport) this.onCheckCookieSupport(this.hasCookieSupport);
    this.isUserFetched = true;
  },
  beforeDestroy() {
    window.removeEventListener('message', this.handleWindowMessage);
  },
  watch: {
    referrer() {
      this.updateUserSignInStatus();
    },
    isDisplayed() {
      this.handleReadEvent();
    },
    isReadTimerEnded() {
      this.handleReadEvent();
    },
  },
  methods: {
    popupLike() {
      if (isAndroid() && isFacebookBrowser()) {
        /* android fb iab stuck when open new window */
        try {
          window.top.location.href = this.popupLikeURL;
          return;
        } catch (err) {
          console.error(err);
        }
      }
      const w = window.open(
        this.popupLikeURL,
        'like',
        'menubar=no,location=no,width=576,height=768',
      );
      this.$root.$emit('openPopupNoticeOverlay', w);
    },
    setIsDisplayed() {
      this.isDisplayed = true;
    },
    async handleReadEvent() {
      if (!this.isRead && this.isReadTimerEnded && this.isDisplayed) {
        await this.postReadEvent();
      }
    },
    async postReadEvent() {
      if (this.isRead) return;
      await apiPostLikeButtonReadEvent(
        this.id,
        this.referrer,
        this.hasCookieSupport,
        this.documentReferrer,
        this.sessionId,
      );
      this.isRead = true;
      if (this.readTimer) clearTimeout(this.readTimer);
    },
    async handleWindowMessage(event) {
      const { data } = event;
      if (typeof data !== 'object') return;

      /* public acitons */
      if (event.source === window.parent || event.source === window.top) {
        switch (data.action) {
          case 'SET_REFERRER': {
            const { referrer } = data.content;
            if (referrer === undefined) return;
            this.$router.replace({
              name: this.$route.name,
              params: this.$route.params,
              hash: this.$route.hash,
              query: { ...this.$route.query, referrer },
            });
            break;
          }
          default:
        }
      }

      /* private actions */
      if (event.origin === `https://${LIKE_CO_HOSTNAME}`) {
        switch (data.action) {
          case 'LOGGED_IN':
            await this.updateUserSignInStatus();
            // Click LikeButton after signing in
            this.$nextTick(() => {
              if (this.$refs.likeButton) {
                this.$refs.likeButton.onPressedKnob();
              }
            });
            break;

          // For preview usage
          case 'PREVIEW': {
            if (!this.isPreview) return;

            const { user, platforms } = data.content;
            if (user) {
              if (user.user) this.id = user.user;
              if (user.displayName) this.displayName = user.displayName;
              if (user.avatar) this.avatar = user.avatar;
              this.avatarHalo = getAvatarHaloTypeFromUser(user);
            }
            if (platforms) this.platforms = platforms;
            break;
          }

          default:
        }
      }
    },
  },
};
