import type { components } from './api';

type Schemas = components['schemas'];

export type UserPublic = Schemas['UserPublic'];
export type TokenResponse = Schemas['TokenResponse'];
export type EnquiryListItem = Schemas['EnquiryListItem'];
export type ServicePublic = Schemas['ServicePublicCard'];
export type ServicePublicDetail = Schemas['ServicePublicDetail'];
export type EnquiryPage = Schemas['Page_EnquiryListItem_'];
