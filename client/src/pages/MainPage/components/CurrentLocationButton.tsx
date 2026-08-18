import styled from '@emotion/styled';
import currentLocationButtonIcon from '../../../../assets/icons/CurrentLocationButtonIcon.svg';

export default function CurrentLocationButton() {
  return (
    <ButtonContainer>
      <Button type="button" aria-label="현재 위치로 이동">
        <img src={currentLocationButtonIcon} alt="" />
      </Button>
    </ButtonContainer>
  );
}

const ButtonContainer = styled.div`
  position: absolute;
  right: 16px;
  bottom: calc(100% + 16px);
`;

const Button = styled.button`
  width: 74px;
  height: 74px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  img {
    display: block;
    width: 60px;
    height: 60px;
  }
`;
